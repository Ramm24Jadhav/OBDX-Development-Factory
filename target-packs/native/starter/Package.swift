// swift-tools-version: 6.0
// The iOS app's code as a Swift package: the Xcode app target (ios/App) depends on it; its tests run on a simulator.
// It sits at the app folder's root so it can bundle the texts both apps share (shared/i18n).
import PackageDescription

let package = Package(
    name: "ObdxApp",
    platforms: [.iOS(.v17)],
    products: [.library(name: "ObdxApp", targets: ["ObdxApp"])],
    dependencies: [
        .package(url: "https://github.com/nalexn/ViewInspector", from: "0.10.0"),
    ],
    targets: [
        .target(
            name: "ObdxApp",
            path: ".",
            exclude: ["android", "ios/App", "ios/Tests", "README.md"],
            sources: ["ios/Sources/ObdxApp"],
            resources: [.copy("shared/i18n")]
        ),
        .testTarget(
            name: "ObdxAppTests",
            dependencies: ["ObdxApp", "ViewInspector"],
            path: "ios/Tests/ObdxAppTests"
        ),
    ]
)
