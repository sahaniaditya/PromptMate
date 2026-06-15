export interface Provider {
  /**
   * Streams a completion for the given system + user messages. Calls onDelta with
   * each text chunk as it arrives, and resolves with the full text when complete.
   */
  stream(
    system: string,
    user: string,
    onDelta: (text: string) => void,
    signal: AbortSignal,
  ): Promise<string>;
}
