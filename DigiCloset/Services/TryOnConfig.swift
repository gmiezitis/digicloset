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

    static var usesWorker: Bool { !workerURL.isEmpty && !appToken.isEmpty }
    static var isReady: Bool { usesWorker || devFalKey != nil }
}
