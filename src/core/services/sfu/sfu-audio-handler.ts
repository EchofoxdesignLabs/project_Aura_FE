export class SfuAudioHandler {
  private audioElements = new Map<string, HTMLAudioElement>();

  setupAudioPlayback(userId: string, stream: MediaStream): void {
    this.cleanupAudioPlayback(userId);

    const audioElement = new Audio();
    audioElement.srcObject = stream;
    audioElement.autoplay = true;
    audioElement.volume = 1;

    audioElement.play().catch(() => {
      const playOnInteraction = () => {
        audioElement.play().catch(() => {
          // Autoplay can remain blocked until a future gesture.
        });
        window.removeEventListener('click', playOnInteraction);
        window.removeEventListener('keydown', playOnInteraction);
      };

      window.addEventListener('click', playOnInteraction);
      window.addEventListener('keydown', playOnInteraction);
    });

    this.audioElements.set(userId, audioElement);
  }

  cleanupAudioPlayback(userId: string): void {
    const audioElement = this.audioElements.get(userId);
    if (!audioElement) {
      return;
    }

    audioElement.pause();
    audioElement.srcObject = null;
    this.audioElements.delete(userId);
  }

  setAudioVolume(userId: string, volume: number): void {
    const audioElement = this.audioElements.get(userId);
    if (!audioElement) {
      return;
    }

    audioElement.volume = Math.max(0, Math.min(1, volume));
  }

  destroy(): void {
    for (const userId of this.audioElements.keys()) {
      this.cleanupAudioPlayback(userId);
    }
  }
}
