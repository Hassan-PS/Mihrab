import React from 'react';

type Props = {
  children: React.ReactNode;
  /** Rendered instead of the children if they throw. Defaults to nothing. */
  fallback?: React.ReactNode;
  /** Optional label for the console warning. */
  label?: string;
};

type State = { hasError: boolean };

/**
 * Minimal error boundary. Wrap non-critical UI (e.g. the diagnostics stats
 * card) so a render error in it can never take down the surrounding screen —
 * the boundary swallows the error and renders `fallback` (nothing by default).
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.warn(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ''}]`, error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
