/**
 * Handles playing remote audio streams reliably using standard <audio> elements.
 * This bypasses Chrome's WebAudio API bugs when processing WebRTC remote streams.
 */
export class MediaHandler {
  private audioElements: Map<string, HTMLAudioElement> = new Map();

  public setupAudioPlayback(userId: string, stream: MediaStream): void {
    // Tear down any existing element for this user
    this.cleanupAudioPlayback(userId);

    const audioElement = new Audio();
    audioElement.srcObject = stream;
    audioElement.autoplay = true;
    audioElement.volume = 1.0; // Default full volume, adjusted by proximity

    // Play returns a promise; handle autoplay failures gracefully
    audioElement.play().catch(() => {
      console.warn(`[WebRTCMedia] Autoplay blocked for ${userId}. Audio will start on first user interaction.`);
      // Resume on next user interaction
      const playOnInteraction = () => {
        audioElement.play().catch(() => { /* still blocked, ignore */ });
        window.removeEventListener('click', playOnInteraction);
        window.removeEventListener('keydown', playOnInteraction);
      };
      window.addEventListener('click', playOnInteraction);
      window.addEventListener('keydown', playOnInteraction);
    });

    this.audioElements.set(userId, audioElement);
    console.log(`[WebRTCMedia] Audio playback started for ${userId}`);
  }

  public cleanupAudioPlayback(userId: string): void {
    const audioElement = this.audioElements.get(userId);
    if (audioElement) {
      audioElement.pause();
      audioElement.srcObject = null;
      this.audioElements.delete(userId);
    }
  }

  public setAudioVolume(userId: string, volume: number): void {
    const audioElement = this.audioElements.get(userId);
    if (audioElement) {
      audioElement.volume = Math.max(0, Math.min(1, volume));
    }
  }

  public destroy(): void {
    for (const userId of this.audioElements.keys()) {
      this.cleanupAudioPlayback(userId);
    }
  }
}
