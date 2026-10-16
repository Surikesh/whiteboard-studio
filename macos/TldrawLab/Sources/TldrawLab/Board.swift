import AppKit
import WebKit

/// One board tab. The WKWebView (and its WebContent process) exists only while the tab is live;
/// hibernated tabs keep just the URL and title.
@MainActor
final class Board: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
  let id = UUID()
  private(set) var url: URL
  private(set) var pageTitle: String
  private(set) var webView: WKWebView?
  private(set) var lastActive = Date()
  private weak var app: AppDelegate?

  let view = NSView()
  private let status = NSTextField(wrappingLabelWithString: "")
  private var observations: [NSKeyValueObservation] = []
  private var retryCount = 0
  private var downloadTargets: [ObjectIdentifier: URL] = [:]

  var key: String { LabConfig.key(for: url) }
  var isLive: Bool { webView != nil }
  private var window: NSWindow? { view.window ?? app?.window }

  init(url: URL, title: String?, app: AppDelegate) {
    self.url = url
    self.pageTitle = title ?? Board.fallbackTitle(for: url)
    self.app = app
    super.init()
    view.autoresizingMask = [.width, .height]
    status.alignment = .center
    status.textColor = .secondaryLabelColor
    status.font = .systemFont(ofSize: 13)
    status.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(status)
    NSLayoutConstraint.activate([
      status.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      status.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      status.widthAnchor.constraint(lessThanOrEqualToConstant: 520),
    ])
    showStatus("Tab unloaded from memory")
  }

  private static func fallbackTitle(for url: URL) -> String {
    url.path.hasPrefix("/d/") ? String(url.path.dropFirst(3)) : "Library"
  }

  // MARK: Lifecycle

  func wake() {
    guard webView == nil, let app else { return }
    let webView = WKWebView(frame: view.bounds, configuration: app.webConfiguration)
    webView.autoresizingMask = [.width, .height]
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.allowsBackForwardNavigationGestures = true
    webView.isInspectable = true
    view.addSubview(webView, positioned: .below, relativeTo: status)
    observations = [
      webView.observe(\.title) { [weak self] webView, _ in
        MainActor.assumeIsolated { self?.titleChanged(webView.title) }
      },
      webView.observe(\.url) { [weak self] webView, _ in
        MainActor.assumeIsolated { self?.urlChanged(webView.url) }
      },
    ]
    self.webView = webView
    retryCount = 0
    status.isHidden = true
    webView.load(URLRequest(url: url))
    app.boardChanged(self)
  }

  func hibernate() {
    guard let webView else { return }
    observations = []
    webView.stopLoading()
    webView.navigationDelegate = nil
    webView.uiDelegate = nil
    webView.removeFromSuperview()
    self.webView = nil
    showStatus("Tab unloaded from memory")
    app?.boardChanged(self)
  }

  func navigate(to target: URL) {
    guard target != url else { return }
    url = target
    retryCount = 0
    webView?.load(URLRequest(url: target))
  }

  func reload() {
    if let webView { webView.reload() } else { wake() }
  }

  func touch() { lastActive = Date() }

  private func showStatus(_ text: String) {
    status.stringValue = text
    status.isHidden = false
  }

  private func titleChanged(_ title: String?) {
    guard let title, !title.isEmpty else { return }
    pageTitle = title.replacingOccurrences(of: " · Tldraw Lab", with: "")
    app?.boardChanged(self)
  }

  private func urlChanged(_ newURL: URL?) {
    guard let newURL, LabConfig.isLabURL(newURL) else { return }
    url = newURL
    app?.boardChanged(self)
  }

  // MARK: WKNavigationDelegate

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
  ) {
    if navigationAction.shouldPerformDownload {
      decisionHandler(.download)
      return
    }
    guard let target = navigationAction.request.url else {
      decisionHandler(.allow)
      return
    }
    let scheme = target.scheme?.lowercased() ?? ""
    let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true

    if !["http", "https", "about", "blob", "data"].contains(scheme) {
      NSWorkspace.shared.open(target)
      decisionHandler(.cancel)
      return
    }
    if isMainFrame, ["http", "https"].contains(scheme), !LabConfig.isLabURL(target) {
      NSWorkspace.shared.open(target)
      decisionHandler(.cancel)
      return
    }
    if navigationAction.navigationType == .linkActivated,
      navigationAction.modifierFlags.contains(.command),
      LabConfig.isLabURL(target)
    {
      app?.open(target)
      decisionHandler(.cancel)
      return
    }
    decisionHandler(.allow)
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationResponse: WKNavigationResponse,
    decisionHandler: @escaping @MainActor (WKNavigationResponsePolicy) -> Void
  ) {
    decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
  }

  func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
    download.delegate = self
  }

  func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
    download.delegate = self
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    retryCount = 0
    status.isHidden = true
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    let error = error as NSError
    if error.domain == NSURLErrorDomain, error.code == NSURLErrorCancelled { return }
    let serverDown = [NSURLErrorCannotConnectToHost, NSURLErrorNetworkConnectionLost, NSURLErrorTimedOut]
      .contains(error.code)
    // A dead non-lab port (stale or mistyped link) is the same board on the current lab server.
    if serverDown, let app, app.retargetToLabServer(self) { return }
    if serverDown, LabConfig.isLocal(url), retryCount < 45 {
      retryCount += 1
      showStatus("Waiting for the Tldraw Lab server… start it with `npm run lab -- start`")
      app?.serverUnavailable()
      DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
        guard let self, let webView = self.webView else { return }
        webView.load(URLRequest(url: self.url))
      }
      return
    }
    showStatus("Could not open \(url.absoluteString)\n\(error.localizedDescription)")
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    // Crashed or killed by the system under memory pressure: reload lazily.
    if app?.selectedBoard === self { webView.reload() } else { hibernate() }
  }

  // MARK: WKUIDelegate

  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if let target = navigationAction.request.url {
      if LabConfig.isLabURL(target) { app?.open(target) } else { NSWorkspace.shared.open(target) }
    }
    return nil
  }

  func webView(
    _ webView: WKWebView,
    runOpenPanelWith parameters: WKOpenPanelParameters,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping @MainActor ([URL]?) -> Void
  ) {
    let panel = NSOpenPanel()
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection
    panel.canChooseDirectories = parameters.allowsDirectories
    panel.canChooseFiles = true
    guard let window else { return completionHandler(nil) }
    panel.beginSheetModal(for: window) { response in
      completionHandler(response == .OK ? panel.urls : nil)
    }
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptAlertPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping @MainActor () -> Void
  ) {
    let alert = NSAlert()
    alert.messageText = message
    presentAlert(alert) { _ in completionHandler() }
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptConfirmPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping @MainActor (Bool) -> Void
  ) {
    let alert = NSAlert()
    alert.messageText = message
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Cancel")
    presentAlert(alert) { completionHandler($0 == .alertFirstButtonReturn) }
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptTextInputPanelWithPrompt prompt: String,
    defaultText: String?,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping @MainActor (String?) -> Void
  ) {
    let alert = NSAlert()
    alert.messageText = prompt
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Cancel")
    let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
    field.stringValue = defaultText ?? ""
    alert.accessoryView = field
    presentAlert(alert) { completionHandler($0 == .alertFirstButtonReturn ? field.stringValue : nil) }
  }

  private func presentAlert(_ alert: NSAlert, completion: @escaping (NSApplication.ModalResponse) -> Void) {
    if let window {
      alert.beginSheetModal(for: window, completionHandler: completion)
    } else {
      completion(alert.runModal())
    }
  }

  // MARK: WKDownloadDelegate

  func download(
    _ download: WKDownload,
    decideDestinationUsing response: URLResponse,
    suggestedFilename: String,
    completionHandler: @escaping @MainActor (URL?) -> Void
  ) {
    let folder = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
    let target = uniqueFile(in: folder, named: suggestedFilename)
    downloadTargets[ObjectIdentifier(download)] = target
    completionHandler(target)
  }

  func downloadDidFinish(_ download: WKDownload) {
    guard let target = downloadTargets.removeValue(forKey: ObjectIdentifier(download)) else { return }
    // Bounces the Downloads stack in the Dock, like Safari does.
    DistributedNotificationCenter.default().post(
      name: Notification.Name("com.apple.DownloadFileFinished"), object: target.path)
  }

  func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
    downloadTargets.removeValue(forKey: ObjectIdentifier(download))
    NSSound.beep()
  }

  private func uniqueFile(in folder: URL, named name: String) -> URL {
    let base = (name as NSString).deletingPathExtension
    let ext = (name as NSString).pathExtension
    var candidate = folder.appendingPathComponent(name)
    var index = 2
    while FileManager.default.fileExists(atPath: candidate.path) {
      let file = ext.isEmpty ? "\(base) \(index)" : "\(base) \(index).\(ext)"
      candidate = folder.appendingPathComponent(file)
      index += 1
    }
    return candidate
  }
}
