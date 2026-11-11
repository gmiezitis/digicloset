import { StyleSheet } from 'react-native';
import { colors, spacing, typography, borderRadius, shadows } from '@theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  heroCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    ...shadows.md,
    gap: spacing.sm,
  },
  heroTitle: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  heroSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  section: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  sectionSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  sectionFootnote: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  helperText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    minWidth: 120,
    borderRadius: borderRadius.md,
    backgroundColor: colors.offWhite,
    padding: spacing.md,
    gap: spacing.xs,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  statValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  statHelper: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  valueList: {
    gap: spacing.xs,
  },
  valueRow: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
  },
  colorBar: {
    flexDirection: 'row',
    borderRadius: borderRadius.round,
    overflow: 'hidden',
    height: 24,
  },
  colorSegment: {
    height: '100%',
  },
  selectedColorCard: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  selectedColorTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  shadeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  shadeSwatch: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  wornGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  wornColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  columnTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  cardRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  rowSubtitle: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
  actionLink: {
    fontSize: typography.fontSize.xs,
    color: colors.accent.primary,
  },
  formRow: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    fontSize: typography.fontSize.sm,
  },
  unitToggle: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  unitChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.round,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  unitChipSelected: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  unitChipText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  unitChipTextSelected: {
    color: colors.text.inverse,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  typeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.round,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  typeChipSelected: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.offWhite,
  },
  typeChipText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  typeChipTextSelected: {
    color: colors.accent.primary,
    fontWeight: typography.fontWeight.medium,
  },
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.accent.primary,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.round,
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: colors.text.inverse,
    fontWeight: typography.fontWeight.semibold,
  },
  feedbackText: {
    textAlign: 'center',
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
  },
});




