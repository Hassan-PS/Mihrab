import { StyleSheet } from 'react-native';

/**
 * Shared styles for Settings cards — task #9.
 *
 * Card-shared chrome (container, section title, common rows). Card-specific
 * styles (widget swatches, segment buttons that aren't shared, etc.) stay in
 * the card files. Migrates to design tokens in task #34.
 */
export const sharedSettingsStyles = StyleSheet.create({
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  rowPress: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  copyBlock: {
    flex: 1,
    paddingEnd: 12,
  },
  changeLink: {
    fontSize: 17,
  },
  label: {
    fontSize: 13,
    marginBottom: 4,
  },
  valueText: {
    fontSize: 16,
    fontWeight: '500',
  },
  help: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchCopy: {
    flex: 1,
    paddingEnd: 12,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  segmentLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
});
