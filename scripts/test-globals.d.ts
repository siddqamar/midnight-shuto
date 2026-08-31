export {};

declare global {
  interface Window {
    __lastTestKey?: string;
    __shutoDebug?: () => any;
    __shutoReset?: () => void;
  }
}
