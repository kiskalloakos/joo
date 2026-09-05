Pod::Spec.new do |s|
  s.name           = 'ReceiptOCR'
  s.version        = '1.0.0'
  s.summary        = 'On-device receipt text recognition for JOO'
  s.description    = 'Uses Apple Vision to recognize text in receipt images.'
  s.author         = 'JOO'
  s.homepage       = 'https://example.invalid/receipt-ocr'
  s.source         = { git: 'https://example.invalid/receipt-ocr.git', tag: s.version.to_s }
  s.platforms      = { ios: '15.1' }
  s.source_files   = '**/*.{h,m,mm,swift}'
  s.swift_version  = '5.9'
  s.dependency 'ExpoModulesCore'
end
