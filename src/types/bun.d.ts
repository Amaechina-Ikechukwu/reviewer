declare const Bun: {
  serve(input: {
    port: number;
    fetch(request: Request): Promise<Response> | Response;
  }): { port: number };
};
