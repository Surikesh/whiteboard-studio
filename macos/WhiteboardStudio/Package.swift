// swift-tools-version:5.10
import PackageDescription

let package = Package(
  name: "WhiteboardStudio",
  platforms: [.macOS(.v14)],
  targets: [
    .executableTarget(name: "WhiteboardStudio", path: "Sources/WhiteboardStudio")
  ]
)
