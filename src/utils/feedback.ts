// =============================================================================
// MÓDULO DE FEEDBACK MULTISENSORIAL (WEB AUDIO API + VIBRACIÓN NATIVA)
// =============================================================================

export type ScanFeedbackType = 
  | 'OK' 
  | 'AGOTADO_TRANSITO' 
  | 'SOBRANTE_MAESTRO' 
  | 'DESCONOCIDO' 
  | 'SOBRANTE_FACTURA'
  | 'ERROR';

class FeedbackService {
  private audioCtx: AudioContext | null = null;

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Reproduce tono de sonido sintetizado usando Web Audio API
   */
  private playTone(freq: number, type: OscillatorType, durationMs: number, startTimeOffsetSec = 0) {
    try {
      const ctx = this.getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startTimeOffsetSec);

      gain.gain.setValueAtTime(0.3, ctx.currentTime + startTimeOffsetSec);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTimeOffsetSec + (durationMs / 1000));

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + startTimeOffsetSec);
      osc.stop(ctx.currentTime + startTimeOffsetSec + (durationMs / 1000));
    } catch (e) {
      console.warn('Audio Context feedback Error:', e);
    }
  }

  /**
   * Dispara vibración nativa del dispositivo
   */
  private vibrate(pattern: number | number[]) {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        console.warn('Vibration API not allowed:', e);
      }
    }
  }

  /**
   * 🟢 FEEDBACK NORMAL (Verde - Conteo OK)
   * Tono corto agudo (800Hz, 100ms) + Vibración simple (50ms)
   */
  public triggerOk() {
    this.playTone(800, 'sine', 100);
    this.vibrate(50);
  }

  /**
   * 🚨 ALERTA CRÍTICA (Rojo/Naranja - Agotado en Tránsito)
   * Tono doble de alarma (1200Hz y 1600Hz) + Vibración pulsante [100, 50, 100, 50, 200]
   */
  public triggerAgotadoTransito() {
    this.playTone(1200, 'sawtooth', 120, 0);
    this.playTone(1600, 'sawtooth', 180, 0.12);
    this.vibrate([100, 50, 100, 50, 200]);
  }

  /**
   * 🟣 SOBRANTE NO FACTURADO (Violeta - Existe en Maestro)
   * Tono medio ascendente (500Hz -> 900Hz)
   */
  public triggerSobranteMaestro() {
    try {
      const ctx = this.getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(500, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.2);

      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      console.warn('Audio Context feedback Error:', e);
    }
    this.vibrate([80, 40, 80]);
  }

  /**
   * ⚠️ CÓDIGO DESCONOCIDO / FUERA DE CATÁLOGO (Gris/Ámbar)
   * Tono triple de advertencia (400Hz) + Vibración larga (300ms)
   */
  public triggerDesconocido() {
    this.playTone(400, 'square', 70, 0);
    this.playTone(400, 'square', 70, 0.1);
    this.playTone(400, 'square', 90, 0.2);
    this.vibrate(300);
  }

  /**
   * 🟡 SOBRANTE SOBRE FACTURA (+X sobre lo facturado)
   */
  public triggerSobranteFactura() {
    this.playTone(650, 'sine', 150);
    this.vibrate([60, 40, 60]);
  }

  /**
   * ❌ ERROR DE ESCANEO / CONEXIÓN
   */
  public triggerError() {
    this.playTone(250, 'sawtooth', 250);
    this.vibrate([150, 50, 150]);
  }

  /**
   * Dispara el feedback según el tipo
   */
  public trigger(type: ScanFeedbackType) {
    switch (type) {
      case 'AGOTADO_TRANSITO':
        this.triggerAgotadoTransito();
        break;
      case 'SOBRANTE_MAESTRO':
        this.triggerSobranteMaestro();
        break;
      case 'DESCONOCIDO':
        this.triggerDesconocido();
        break;
      case 'SOBRANTE_FACTURA':
        this.triggerSobranteFactura();
        break;
      case 'ERROR':
        this.triggerError();
        break;
      case 'OK':
      default:
        this.triggerOk();
        break;
    }
  }
}

export const feedbackService = new FeedbackService();
