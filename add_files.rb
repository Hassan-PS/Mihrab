require 'xcodeproj'

project_path = 'ios/PrayerApp.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Find the main app target
target = project.targets.find { |t| t.name == 'PrayerApp' }
group = project.main_group.find_subpath(File.join('PrayerApp'), true)

# Add files
swift_file = group.new_file('CompassModule.swift')
m_file = group.new_file('CompassModule.m')

# Add to compile sources
target.source_build_phase.add_file_reference(swift_file)
target.source_build_phase.add_file_reference(m_file)

project.save
puts "Added files to Xcode project"
