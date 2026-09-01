// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NanoIcons",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "NanoIcons", targets: ["NanoIcons"])
    ],
    targets: [
        .target(name: "NanoIcons")
    ]
)
