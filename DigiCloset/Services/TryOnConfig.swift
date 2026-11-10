import Foundation

/// Production: fill in the worker URL and token after deploying Backend/tryon-worker.
/// Development: a git-ignored Secrets.plist with FAL_KEY lets your own phone call
/// fal.ai directly. Never ship a build that contains Secrets.plist.
enum TryOnConfig {
    static let workerURL = ""   // e.g. "https://digicloset-tryon.you.workers.dev"
    static let appToken = ""    // same value as the worker's APP_TOKEN secret

    static let devFalKey: String? = {
        guard let url = Bundle.main.url(forResource: "Secrets", withExtension: "plist"),
              let dict = NSDictionary(contentsOf: url),
              let key = dict["FAL_KEY"] as? String, !key.isEmpty else { return nil }
        return key
    }()

    /// A random id for this install, sent to the worker so daily limits are per
    /// phone rather than per Wi-Fi network. It identifies nothing else.
    static let deviceID: String = {
        let key = "tryonDeviceID"
        if let saved = UserDefaults.standard.string(forKey: key) { return saved }
        let made = UUID().uuidString
        UserDefaults.standard.set(made, forKey: key)
        return made
    }()

    static var usesWorker: Bool { !workerURL.isEmpty && !appToken.isEmpty }
    static var isReady: Bool { usesWorker || devFalKey != nil }
}
