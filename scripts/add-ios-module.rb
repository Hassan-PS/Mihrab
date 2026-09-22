#!/usr/bin/env ruby
# Add a native module's Swift + ObjC files to the iOS app target.
#   ruby scripts/add-ios-module.rb WordPlayer
require 'xcodeproj'
name = ARGV[0] or abort('usage: add-ios-module.rb <ModuleName>')
project = Xcodeproj::Project.open('ios/PrayerApp.xcodeproj')
target = project.targets.find { |t| t.name == 'PrayerApp' }
group = project.main_group.find_subpath('PrayerApp', true)
# The PrayerApp GROUP has no path of its own — its files each carry
# `path = PrayerApp/<file>` relative to ios/ — so a bare file name here
# resolved to ios/<file>, which does not exist. Xcode shows the file as
# red and the build fails with "Build input file cannot be found", which
# nothing on Android or in jest can see (caught by release.sh's Catalyst
# step on 2.25.1). Name it from where the file really is.
["#{name}.swift", "#{name}.m"].each do |file|
  next if group.files.any? { |f| f.path.to_s.end_with?(file) }
  on_disk = File.join(__dir__, '..', 'ios', 'PrayerApp', file)
  abort("#{file} is not in ios/PrayerApp/") unless File.exist?(on_disk)
  ref = group.new_reference("PrayerApp/#{file}")
  ref.name = file
  target.source_build_phase.add_file_reference(ref)
  puts "added #{file}"
end
project.save
