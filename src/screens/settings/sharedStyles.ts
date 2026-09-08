import { StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

/**
 * Shared styles for Settings cards — task #9.
 *
 * Card-shared chrome (container, section title, common rows). Card-specific
 * styles (widget swatches, segment buttons that aren't shared, etc.) stay in
 * the card files. Migrates to design tokens in task #34.
 */
export const sharedSettingsStyles = StyleSheet.create({
  sectionTitle: {
    fontSize: TYPE.footnote.fontSize,
    fontWeight: '600',
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  card: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  rowPress: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  copyBlock: {
    flex: 1,
    paddingEnd: SPACING.md,
  },
  changeLink: {
    fontSize: TYPE.title3.fontSize,
  },
  label: {
    fontSize: TYPE.footnote.fontSize,
    marginBottom: SPACING.xs,
  },
  valueText: {
    fontSize: TYPE.body.fontSize,
    fontWeight: '500',
  },
  help: {
    fontSize: TYPE.footnote.fontSize,
    marginTop: SPACING.xs,
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchCopy: {
    flex: 1,
    paddingEnd: SPACING.md,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  segment: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  segmentLabel: {
    fontSize: TYPE.body.fontSize,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: TYPE.body.fontSize,
  },
});
