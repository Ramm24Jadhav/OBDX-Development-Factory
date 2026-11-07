import Foundation

/// Where the bank's OBDX REST services are (https), and the nonce OBDX asks for on calls that change something.
public enum ApiConfig {
    /// Set from the app's Info.plist key ObdxBaseUrl (per build configuration).
    nonisolated(unsafe) public static var baseUrl = Bundle.main.object(forInfoDictionaryKey: "ObdxBaseUrl") as? String ?? "https://obdx.bank.local"
    nonisolated(unsafe) public static var timeout: TimeInterval = 30
    /// An empty path turns the nonce off (for a mock server). Match both to the bank's OBDX release.
    nonisolated(unsafe) public static var noncePath = "/digx/v1/session/nonce"
    nonisolated(unsafe) public static var nonceHeader = "X-Nonce"
}

/// An error answer from an OBDX service, or a network failure (status 0).
public struct ApiError: Error {
    public let status: Int
    public let message: String
}

/// Calls OBDX REST services. The session cookie is kept in memory only (an ephemeral session, never written to the
/// device) and sent with every call; a fresh nonce goes with every call that changes something.
public final class ApiClient: @unchecked Sendable {
    private let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieAcceptPolicy = .onlyFromMainDocumentDomain
        config.timeoutIntervalForRequest = ApiConfig.timeout
        return URLSession(configuration: config, delegate: PinningDelegate(), delegateQueue: nil)
    }()

    public func get<T: Decodable>(_ path: String) async throws -> T { try await request("GET", path, nil as Empty?) }
    public func post<B: Encodable, T: Decodable>(_ path: String, _ body: B) async throws -> T { try await request("POST", path, body) }
    public func put<B: Encodable, T: Decodable>(_ path: String, _ body: B) async throws -> T { try await request("PUT", path, body) }
    public func delete<T: Decodable>(_ path: String) async throws -> T { try await request("DELETE", path, nil as Empty?) }

    private struct Empty: Codable {}

    private func request<B: Encodable, T: Decodable>(_ method: String, _ path: String, _ body: B?) async throws -> T {
        var request = try urlRequest(method, path)
        if method != "GET" {
            for (name, value) in try await nonce() { request.setValue(value, forHTTPHeaderField: name) }
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await send(request)
        guard (200..<300).contains(response.statusCode) else {
            throw ApiError(status: response.statusCode, message: Self.message(of: data) ?? "The request failed (\(response.statusCode)).")
        }
        return try JSONDecoder().decode(T.self, from: data.isEmpty ? Data("{}".utf8) : data)
    }

    private func nonce() async throws -> [String: String] {
        guard !ApiConfig.noncePath.isEmpty else { return [:] }
        let (_, response) = try await send(try urlRequest("POST", ApiConfig.noncePath))
        guard (200..<300).contains(response.statusCode), let value = response.value(forHTTPHeaderField: ApiConfig.nonceHeader), !value.isEmpty else {
            throw ApiError(status: response.statusCode, message: "The bank did not accept the request. Sign in again and try once more.")
        }
        return [ApiConfig.nonceHeader: value]
    }

    private func urlRequest(_ method: String, _ path: String) throws -> URLRequest {
        guard let url = URL(string: ApiConfig.baseUrl + path), url.scheme == "https" else {
            throw ApiError(status: 0, message: "The bank's address must be https.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw ApiError(status: 0, message: "The bank sent an answer the app cannot read.") }
            return (data, http)
        } catch let error as ApiError {
            throw error
        } catch let error as URLError where error.code == .cancelled && !Task.isCancelled {
            // PinningDelegate cancelled the handshake: the certificate or its key is not the bank's
            throw ApiError(status: 0, message: CertificatePins.updateMessage)
        } catch {
            throw ApiError(status: 0, message: "The bank could not be reached. Check your connection and try again.")
        }
    }

    /// OBDX error answers carry their message in status.message.detail or a top-level message.
    private static func message(of data: Data) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        if let status = json["status"] as? [String: Any], let message = status["message"] as? [String: Any] {
            return (message["detail"] as? String) ?? (message["title"] as? String)
        }
        return json["message"] as? String
    }
}

/// The one client of the app.
public let api = ApiClient()
