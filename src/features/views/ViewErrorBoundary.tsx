import { Component, type ErrorInfo, type ReactNode } from "react";

interface ViewErrorBoundaryProps {
  readonly children: ReactNode;
  readonly viewName: string;
}

interface ViewErrorBoundaryState {
  readonly hasError: boolean;
}

export class ViewErrorBoundary extends Component<
  ViewErrorBoundaryProps,
  ViewErrorBoundaryState
> {
  public override state: ViewErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): ViewErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Falha ao renderizar ${this.props.viewName}.`, error, info);
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="view-error" role="alert">
          <strong>Não foi possível exibir {this.props.viewName}.</strong>
          <span>As tarefas continuam preservadas. Tente carregar a visualização novamente.</span>
          <button type="button" onClick={() => { this.setState({ hasError: false }); }}>
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
