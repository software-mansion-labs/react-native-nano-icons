require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "react-native-nano-icons"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.author       = package["author"]
  s.source       = { :git => package["repository"], :tag => "#{s.version}" }
  s.platforms    = { :ios => "15.1" }
  s.source_files = "ios/**/*.{h,m,mm,cpp}"
  s.requires_arc = true

  install_modules_dependencies(s)
end
