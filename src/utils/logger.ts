export type LogLevel = "info" | "warn" | "error" | "debug";

export class Logger {
  constructor(private readonly scope: string) {}

  private emit(level: LogLevel, msg: string, extra?: unknown): void {
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level.toUpperCase()}] [${this.scope}]`;
    const line = extra === undefined ? `${prefix} ${msg}` : `${prefix} ${msg} ${safeStringify(extra)}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  info(msg: string, extra?: unknown): void {
    this.emit("info", msg, extra);
  }

  warn(msg: string, extra?: unknown): void {
    this.emit("warn", msg, extra);
  }

  error(msg: string, extra?: unknown): void {
    this.emit("error", msg, extra);
  }

  debug(msg: string, extra?: unknown): void {
    if (process.env.QA_DEBUG === "1") this.emit("debug", msg, extra);
  }

  child(subscope: string): Logger {
    return new Logger(`${this.scope}:${subscope}`);
  }
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
