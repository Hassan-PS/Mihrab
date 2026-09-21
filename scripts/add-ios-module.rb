#!/usr/bin/env ruby
# Add a native module's Swift + ObjC files to the iOS app target.
#   ruby scripts/add-ios-module.rb WordPlayer
require 'xcodeproj'
name = ARGV[0] or abort('usage: add-ios-module.rb <ModuleName>')
project = Xcodeproj::Project.open('ios/PrayerApp.xcodeproj')
target = project.targets.find { |t| t.name == 'PrayerApp' }
group = project.main_group.find_subpath('PrayerApp', true)
["#{name}.swift", "#{name}.m"].each do |file|
  next if group.files.any? { |f| f.path.to_s.end_with?(file) }
  ref = group.new_file(file)
  target.source_build_phase.add_file_reference(ref)
  puts "added #{file}"
end
project.save
