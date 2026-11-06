/*
 * <<Module>> services of OBDX, used by the <<module>> screens. Paths and field names as in the bank's OBDX REST services.
 */
import Foundation

/// <<What is sent>>.
public struct <<Name>>Request: Encodable {
    public let <<field>>: String
}

/// <<What comes back>>.
public struct <<Name>>Response: Decodable {
    public let <<field>>: String
}

/// <<What the call does>>: <<METHOD and path of the OBDX service>>.
public func <<name>>(_ request: <<Name>>Request) async throws -> <<Name>>Response {
    try await api.post("<<path>>", request)
}
