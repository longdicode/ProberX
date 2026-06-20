declare module "global-agent" {
  export function bootstrap(): boolean;
  export function createGlobalProxyAgent(config?: {
    environmentVariableNamespace?: string;
    forceGlobalAgent?: boolean;
    socketConnectionTimeout?: number;
  }): void;
}
