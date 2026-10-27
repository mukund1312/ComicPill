Pod::Spec.new do |s|
  s.name           = 'ComicArchive'
  s.version        = '1.0.0'
  s.summary        = 'Reads CBR (RAR), CB7 (7z) and PDF comics, grayscale thumbnails and on-device text recognition for ComicPill.'
  s.description    = 'The iOS half of the comic-archive native module; the Android half lives in ../android.'
  s.author         = 'ComicPill'
  s.homepage       = 'https://github.com/mukund1312/ComicPill'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/mukund1312/ComicPill.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'UnrarKit'
  s.dependency 'SWCompression'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = '**/*.{h,m,mm,swift}'
end
