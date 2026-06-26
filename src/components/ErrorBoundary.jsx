import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[APEX ErrorBoundary]', error, info)
  }
  handleReset = () => this.setState({ hasError: false, error: null })
  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-card border border-gold-1/30 bg-navy-3 text-xl">⚠️</div>
            <h2 className="text-lg font-semibold text-ink-1">Something went wrong</h2>
            <p className="max-w-md text-sm text-ink-2">{this.state.error?.message || 'Unexpected error in this section.'}</p>
            <button type="button" onClick={this.handleReset} className="btn-ghost">Try again</button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
