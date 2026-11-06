import Foundation

/// The texts of shared/i18n/en.json (bundled by the Swift package), read once. Add languages as more JSON files beside it.
enum Texts {
    nonisolated(unsafe) static let all: [String: Any] = {
        guard let url = Bundle.module.url(forResource: "en", withExtension: "json", subdirectory: "i18n"),
              let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return json
    }()

    static func find(_ key: String) -> String? {
        var node: Any? = all
        for part in key.split(separator: ".") {
            node = (node as? [String: Any])?[String(part)]
        }
        return node as? String
    }
}

/// The text for a key such as "fundTransfer.remarks", with {name} placeholders filled in; the key when it is missing.
public func t(_ key: String, _ values: [String: String] = [:]) -> String {
    var text = Texts.find(key) ?? key
    for (name, value) in values {
        text = text.replacingOccurrences(of: "{\(name)}", with: value)
    }
    return text
}
