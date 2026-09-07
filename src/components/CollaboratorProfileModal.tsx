import React, { useState, useRef, useEffect } from 'react';
import { 
  UserCheck, 
  Camera, 
  Image as ImageIcon, 
  X, 
  Check, 
  RefreshCw, 
  AlertOctagon, 
  ZoomIn, 
  Move,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { getIniciales } from '../utils/formatUtils';

interface CollaboratorProfileModalProps {
  isOpen: boolean;
  currentName: string;
  currentAvatar: string;
  onClose: () => void;
  onSave: (name: string, avatar: string) => void;
}

export interface AvatarOption {
  id: string;
  label: string;
  gender: 'M' | 'F';
  url: string;
}

// Lista Centralizada de Avatares Predefinidos
export const DEFAULT_AVATARS: AvatarOption[] = [
  // Masculinos
  { id: 'm1', label: 'Carlos', gender: 'M', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos&backgroundColor=001040' },
  { id: 'm2', label: 'Diego', gender: 'M', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Diego&backgroundColor=061224' },
  { id: 'm3', label: 'Esteban', gender: 'M', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Esteban&backgroundColor=0c2847' },
  { id: 'm4', label: 'Fernando', gender: 'M', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Fernando&backgroundColor=001f7a' },
  { id: 'm5', label: 'Gabriel', gender: 'M', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Gabriel&backgroundColor=1d4ed8' },
  { id: 'm6', label: 'Hugo', gender: 'M', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Hugo&backgroundColor=0369a1' },
  // Femeninos
  { id: 'f1', label: 'Ana', gender: 'F', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ana&backgroundColor=001040' },
  { id: 'f2', label: 'Beatriz', gender: 'F', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Beatriz&backgroundColor=061224' },
  { id: 'f3', label: 'Carla', gender: 'F', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carla&backgroundColor=0c2847' },
  { id: 'f4', label: 'Daniela', gender: 'F', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Daniela&backgroundColor=001f7a' },
  { id: 'f5', label: 'Elena', gender: 'F', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Elena&backgroundColor=1d4ed8' },
  { id: 'f6', label: 'Fernanda', gender: 'F', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Fernanda&backgroundColor=0369a1' },
];

interface AvatarCropperModalProps {
  imageSrc: string;
  onClose: () => void;
  onCropComplete: (croppedDataUrl: string) => void;
}

// Subcomponente de Recorte Interactivo (Pan & Zoom con Canvas 1:1)
const AvatarCropperModal: React.FC<AvatarCropperModalProps> = ({
  imageSrc,
  onClose,
  onCropComplete
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);

  const VIEWPORT_SIZE = 240;

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImgElement(img);
    img.src = imageSrc;
  }, [imageSrc]);

  const handlePointerDown = (clientX: number, clientY: number) => {
    setIsDragging(true);
    setDragStart({ x: clientX - pan.x, y: clientY - pan.y });
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    setPan({
      x: clientX - dragStart.x,
      y: clientY - dragStart.y
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const handleApplyCrop = () => {
    if (!imgElement) return;

    const W = imgElement.naturalWidth || imgElement.width;
    const H = imgElement.naturalHeight || imgElement.height;
    if (!W || !H) return;

    const V = VIEWPORT_SIZE;
    const initialScale = Math.max(V / W, V / H);
    const scale = initialScale * zoom;

    const imgRenderedWidth = W * scale;
    const imgRenderedHeight = H * scale;

    const imgLeftOnScreen = (V / 2 + pan.x) - (imgRenderedWidth / 2);
    const imgTopOnScreen = (V / 2 + pan.y) - (imgRenderedHeight / 2);

    const Sx = (0 - imgLeftOnScreen) / scale;
    const Sy = (0 - imgTopOnScreen) / scale;
    const Sw = V / scale;
    const Sh = V / scale;

    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#020b18';
      ctx.fillRect(0, 0, 200, 200);
      ctx.drawImage(imgElement, Sx, Sy, Sw, Sh, 0, 0, 200, 200);
      const webpUrl = canvas.toDataURL('image/webp', 0.8);
      onCropComplete(webpUrl);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#00081d]/90 backdrop-blur-md p-4 animate-fade-in font-sans select-none">
      <div className="w-full max-w-xs bg-[#061224] border border-sky-500/30 rounded-3xl p-5 space-y-4 shadow-2xl text-white relative flex flex-col items-center">
        
        {/* Encabezado del Recortador */}
        <div className="w-full flex items-center justify-between border-b border-sky-500/20 pb-2.5">
          <h4 className="font-['Chakra_Petch'] font-black text-xs uppercase tracking-wider text-sky-300 flex items-center space-x-1.5">
            <Move className="w-4 h-4 text-sky-400" />
            <span>Encuadrar y Recortar</span>
          </h4>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Viewport Interactivo (240x240 px) */}
        <div
          className="relative w-[240px] h-[240px] rounded-2xl overflow-hidden bg-[#020b18] border border-sky-500/30 shadow-inner cursor-grab active:cursor-grabbing touch-none select-none flex items-center justify-center"
          onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
          onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={(e) => {
            if (e.touches.length === 1) {
              handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
            }
          }}
          onTouchMove={(e) => {
            if (e.touches.length === 1) {
              handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
            }
          }}
          onTouchEnd={handlePointerUp}
        >
          {imgElement && (
            <img
              src={imageSrc}
              alt="Avatar Target"
              draggable={false}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain'
              }}
              className="pointer-events-none transition-transform duration-75"
            />
          )}

          {/* Guía Circular Transparente con Anillo Celeste */}
          <div className="absolute inset-0 pointer-events-none border-[20px] border-[#00081d]/80 rounded-full flex items-center justify-center">
            <div className="w-full h-full rounded-full border-2 border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.5)]" />
          </div>
        </div>

        {/* Control Slider de Zoom */}
        <div className="w-full space-y-1 px-1">
          <div className="flex items-center justify-between text-[11px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider">
            <span className="flex items-center space-x-1">
              <ZoomIn className="w-3.5 h-3.5 text-sky-400" />
              <span>Ajustar Zoom:</span>
            </span>
            <span className="font-mono text-sky-400">{zoom.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-[#020b18] rounded-lg appearance-none cursor-pointer accent-sky-400"
          />
        </div>

        {/* Indicación Técnica */}
        <p className="text-[10px] text-slate-400 text-center font-mono leading-tight">
          Arrastrá con el dedo o mouse para centrar tu rostro dentro del círculo.
        </p>

        {/* Botones del Modal de Recorte */}
        <div className="w-full flex space-x-2 pt-2 border-t border-sky-500/20">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApplyCrop}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center space-x-1 transition-all cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Aplicar Recorte</span>
          </button>
        </div>

      </div>
    </div>
  );
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/webp';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

export const CollaboratorProfileModal: React.FC<CollaboratorProfileModalProps> = ({
  isOpen,
  currentName,
  currentAvatar,
  onClose,
  onSave
}) => {
  const [tempUser, setTempUser] = useState<string>(() => (currentName || 'OPERADOR 1').toUpperCase());
  const [selectedAvatar, setSelectedAvatar] = useState<string>(() => currentAvatar || '');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Imagen cruda lista para recortar
  const [cropperRawImage, setCropperRawImage] = useState<string | null>(null);

  // Detección de Dispositivo Móvil / Táctil para visibilidad de botón de Cámara
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    const isSmallScreen = window.innerWidth < 640;
    return Boolean(hasTouch || isSmallScreen);
  });

  useEffect(() => {
    const checkMobile = () => {
      const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
      const isSmallScreen = window.innerWidth < 640;
      setIsMobileDevice(Boolean(hasTouch || isSmallScreen));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [googlePhotoUrl, setGooglePhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchGooglePhoto = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const photo = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
        if (photo) {
          setGooglePhotoUrl(photo);
        }
      } catch (err) {
        console.warn('Error al verificar metadatos de Google Auth:', err);
      }
    };

    if (isOpen) {
      fetchGooglePhoto();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Obtener o generar device_id único en localStorage
  const getDeviceId = (): string => {
    let deviceId = localStorage.getItem('audimas_device_id');
    if (!deviceId) {
      deviceId = typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('audimas_device_id', deviceId);
    }
    return deviceId;
  };

  // Manejador de selección de archivo (Cámara o Galería)
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result) {
        setCropperRawImage(evt.target.result as string);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Guardar perfil en Supabase Auth, Storage, DB y localStorage
  const handleSave = async () => {
    const finalName = tempUser.trim().toUpperCase();
    if (!finalName) return;

    setErrorMessage(null);
    setIsSaving(true);

    console.log('Guardando avatar:', selectedAvatar);

    try {
      let finalAvatarUrl = selectedAvatar;

      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Verificar si el nombre ya pertenece a otro usuario
        const { data: existingUser, error: checkError } = await supabase
          .from('profiles')
          .select('id')
          .ilike('full_name', finalName)
          .neq('id', user.id)
          .maybeSingle();

        if (existingUser) {
          setIsSaving(false);
          setErrorMessage(`El nombre "${finalName}" ya está en uso por otro colaborador. Por favor, agrega una inicial o tu apellido para distinguirte en las auditorías.`);
          return;
        }

        // Subir foto a Supabase Storage (bucket avatars) si es data URL base64
        if (selectedAvatar && selectedAvatar.startsWith('data:image/')) {
          try {
            const imageBlob = dataUrlToBlob(selectedAvatar);
            const userId = user.id;

            const { error: storageError } = await supabase.storage
              .from('avatars')
              .upload(`${userId}.webp`, imageBlob, {
                contentType: 'image/webp',
                upsert: true
              });

            if (storageError) {
              console.error('Error Supabase Storage Avatar:', storageError);
            } else {
              const { data: publicUrlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(`${userId}.webp`);

              if (publicUrlData?.publicUrl) {
                finalAvatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
                console.log('Avatar subido a Storage exitosamente:', finalAvatarUrl);
              }
            }
          } catch (uploadErr) {
            console.error('Error al procesar Blob de avatar:', uploadErr);
          }
        }

        await supabase.auth.updateUser({
          data: {
            custom_name: finalName,
            display_name: finalName,
            full_name: finalName
          }
        });

        const { error: profErr } = await supabase
          .from('profiles')
          .update({
            avatar_url: finalAvatarUrl,
            full_name: finalName,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (profErr) {
          console.error('Error al actualizar profile en Supabase:', profErr);
          alert('Error al guardar en base de datos: ' + profErr.message);
        }
      }

      setSelectedAvatar(finalAvatarUrl);
      localStorage.setItem('audimas_collaborator', finalName);
      localStorage.setItem('audimas_collaborator_avatar', finalAvatarUrl);
      try {
        const cachedProfStr = localStorage.getItem('audimas_user_profile');
        if (cachedProfStr) {
          const cachedProf = JSON.parse(cachedProfStr);
          cachedProf.avatar_url = finalAvatarUrl;
          cachedProf.nombre_apellido = finalName;
          localStorage.setItem('audimas_user_profile', JSON.stringify(cachedProf));
        }
      } catch (e) {}

      onSave(finalName, finalAvatarUrl);
    } catch (err: any) {
      console.error('Error Supabase Avatar:', err);
      localStorage.setItem('audimas_collaborator', finalName);
      localStorage.setItem('audimas_collaborator_avatar', selectedAvatar);
      onSave(finalName, selectedAvatar);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00081d]/85 backdrop-blur-md p-4 animate-fade-in font-sans select-none overflow-y-auto">
        <div className="w-full max-w-sm bg-[#061224] border border-sky-500/30 rounded-3xl p-5 space-y-4 shadow-2xl text-white relative">
          
          {/* Botón Cierre */}
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="absolute top-4 right-4 p-1.5 text-sky-400 hover:text-white bg-[#0c244d] rounded-xl border border-sky-500/30 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Encabezado */}
          <div className="flex items-center space-x-2.5">
            <UserCheck className="w-5 h-5 text-sky-400" />
            <h3 className="font-['Chakra_Petch'] font-black text-sm uppercase tracking-wider text-sky-300">
              Perfil del Operario / Auditor
            </h3>
          </div>

          {/* Banner de Error */}
          {errorMessage && (
            <div className="p-3 bg-red-950/90 border border-red-500/50 rounded-2xl flex items-start space-x-2.5 text-red-200 text-xs shadow-lg animate-fade-in">
              <AlertOctagon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed font-medium">{errorMessage}</p>
            </div>
          )}

          {/* 1. Vista Previa en Vivo (80x80 px) */}
          <div className="flex flex-col items-center justify-center space-y-2 py-1">
            <div className="relative w-20 h-20 rounded-full border-2 border-sky-400/60 shadow-xl overflow-hidden bg-[#020b18] flex items-center justify-center">
              {selectedAvatar && selectedAvatar.trim() !== '' ? (
                <img
                  src={selectedAvatar}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <span className="font-['Chakra_Petch'] font-black text-2xl text-sky-300">
                  {getIniciales(tempUser)}
                </span>
              )}
            </div>
            <span className="text-[10px] font-['Chakra_Petch'] font-bold text-sky-400/80 uppercase tracking-widest">
              VISTA PREVIA EN VIVO
            </span>
          </div>

          {/* 2. Campo de Nombre (Siempre en MAYÚSCULAS) */}
          <div className="space-y-1">
            <label className="text-[11px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider block">
              Nombre del Operario:
            </label>
            <input
              type="text"
              value={tempUser}
              onChange={(e) => {
                setTempUser(e.target.value.toUpperCase());
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="NOMBRE DEL OPERARIO..."
              className="w-full py-2.5 px-3 bg-[#020b18] border border-sky-500/40 text-white font-bold text-xs rounded-xl focus:outline-none focus:border-sky-400 uppercase font-mono tracking-wider"
            />
          </div>

          {/* 3. Selección de Avatares (12 Predefinidos) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider">
                Seleccionar Avatar Predefinido:
              </span>
              <span className="text-[10px] font-mono text-sky-400/70">12 Avatares</span>
            </div>

            <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto no-scrollbar p-1 bg-[#020b18] border border-sky-500/20 rounded-2xl">
              {DEFAULT_AVATARS.map((av) => {
                const isSelected = selectedAvatar === av.url;
                return (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => setSelectedAvatar(av.url)}
                    className={`relative w-10 h-10 rounded-full border-2 transition-all overflow-hidden flex items-center justify-center cursor-pointer ${
                      isSelected
                        ? 'border-sky-400 ring-2 ring-sky-400/40 scale-105 bg-blue-600/30'
                        : 'border-slate-800 hover:border-sky-500/50 bg-[#061224]'
                    }`}
                    title={av.label}
                  >
                    <img src={av.url} alt={av.label} className="w-full h-full object-cover" />
                    {isSelected && (
                      <div className="absolute inset-0 bg-blue-600/40 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-white font-bold" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Botones Diferenciados: Tomar Foto vs Galería/PC (Recorte Interactivo 1:1) */}
          <div className="pt-1 space-y-2">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleFileSelected}
              className="hidden"
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelected}
              className="hidden"
            />
            
            <div className={`grid ${isMobileDevice ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
              {isMobileDevice && (
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isSaving}
                  className="py-2.5 px-3 bg-[#0c244d] hover:bg-[#163a75] active:bg-[#163a75] text-sky-300 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl border border-sky-500/30 flex items-center justify-center space-x-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  <Camera className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>Tomar Foto</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                disabled={isSaving}
                className="py-2.5 px-3 bg-[#0c244d] hover:bg-[#163a75] active:bg-[#163a75] text-sky-300 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl border border-sky-500/30 flex items-center justify-center space-x-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                <ImageIcon className="w-4 h-4 text-sky-400 shrink-0" />
                <span>{isMobileDevice ? 'Galería / PC' : 'Subir Imagen (Galería / PC)'}</span>
              </button>
            </div>

            {/* Botón de Restablecimiento según Origen (Google OAuth vs Nativo) */}
            {googlePhotoUrl && selectedAvatar !== googlePhotoUrl && (
              <button
                type="button"
                onClick={() => setSelectedAvatar(googlePhotoUrl)}
                disabled={isSaving}
                className="w-full py-2 px-3 bg-sky-950/60 hover:bg-sky-900/60 active:bg-sky-900/80 text-sky-300 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl border border-sky-500/40 flex items-center justify-center space-x-2 transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Usar foto de mi cuenta de Google</span>
              </button>
            )}

            {!googlePhotoUrl && selectedAvatar && selectedAvatar.trim() !== '' && (
              <button
                type="button"
                onClick={() => setSelectedAvatar('')}
                disabled={isSaving}
                className="w-full py-2 px-3 bg-red-950/50 hover:bg-red-900/60 active:bg-red-900/80 text-red-300 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl border border-red-500/40 flex items-center justify-center space-x-2 transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span>Quitar foto y usar iniciales</span>
              </button>
            )}
          </div>

          {/* Botones de Acción */}
          <div className="flex justify-end space-x-2 pt-2 border-t border-sky-500/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-slate-400 hover:text-white font-bold text-xs cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!tempUser.trim() || isSaving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/30 disabled:opacity-50 transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>Guardar Perfil</span>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Visor / Modal de Recorte Interactivo (Pan & Zoom) */}
      {cropperRawImage && (
        <AvatarCropperModal
          imageSrc={cropperRawImage}
          onClose={() => setCropperRawImage(null)}
          onCropComplete={(croppedDataUrl) => {
            setSelectedAvatar(croppedDataUrl);
            setCropperRawImage(null);
          }}
        />
      )}
    </>
  );
};
