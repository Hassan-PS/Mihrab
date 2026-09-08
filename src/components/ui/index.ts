/**
 * Component library barrel — task #39, extended for the 2026 redesign
 * (docs/design/redesign-plan.md §2.5–2.7).
 *
 * One canonical place to import the design-system components from. Per
 * the `reviewer` subagent rule (after #39 lands), screens should import
 * these from here rather than rolling their own.
 *
 * Surfaces: `Card` (one thing that stands alone), `Group` (rows, nothing
 * else), `Row`, `Tile` (a number on the page — never in a card).
 * Controls: `Button`, `Chip`, `SegmentedControl`, `Stepper`.
 */
export { Banner } from './Banner';
export type { BannerVariant } from './Banner';
export { Button } from './Button';
export type { ButtonVariant } from './Button';
export { Card, CardDepth } from './Card';
export type { CardVariant } from './Card';
export { Chip } from './Chip';
export { EmptyState } from './EmptyState';
export { Group, RowDivider, ROW_PADDING } from './Group';
export { Row } from './Row';
export { SegmentedControl } from './SegmentedControl';
export type { Segment } from './SegmentedControl';
export { Skeleton } from './Skeleton';
export { Stepper } from './Stepper';
export { Tile } from './Tile';
