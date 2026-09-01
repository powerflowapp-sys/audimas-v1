import React, { useState, useRef } from 'react';
import { UserCheck, Camera, X, Check, RefreshCw, AlertOctagon } from 'lucide-react';
import { supabase } from '../services/supabase';

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

// Lista Centralizada de Avatares Predefinidos (Facilmente sustituibles por imágenes locales)
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

export const CollaboratorProfileModal: React.FC<CollaboratorProfileModalProps> = ({
  isOpen,
  currentName,
  currentAvatar,
  onClose,
  onSave
}) => {
  const [tempUser, setTempUser] = useState<string>(() => (currentName || 'OPERADOR 1').toUpperCase());
  const [selectedAvatar, setSelectedAvatar] = useState<string>(() => currentAvatar || DEFAULT_AVATARS[0].url);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Compresión estricta en el navegador canvas 200x200 -> WebP (0.8 quality)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    setErrorMessage(null);
    try {
      const webpBase64 = await compressImageToWebP(file);
      setSelectedAvatar(webpBase64);
    } catch (err) {
      console.error('Error al procesar/comprimir imagen:', err);
    } finally {
      setIsCompressing(false);
    }
  };

  const compressImageToWebP = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const size = 200;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('No canvas context available'));
            return;
          }

          // Recorte cuadrado centrado
          let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height;
          if (img.width > img.height) {
            sWidth = img.height;
            sx = (img.width - img.height) / 2;
          } else {
            sHeight = img.width;
            sy = (img.height - img.width) / 2;
          }

          ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, size, size);
          // Exportar en WebP calidad 80% (10-15KB)
          const webpDataUrl = canvas.toDataURL('image/webp', 0.8);
          resolve(webpDataUrl);
        };
        img.onerror = () => reject(new Error('Error al cargar la imagen'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsDataURL(file);
    });
  };

  // Guardar perfil validando nombre único por device_id en Supabase
  const handleSave = async () => {
    const finalName = tempUser.trim().toUpperCase();
    if (!finalName) return;

    setErrorMessage(null);
    setIsSaving(true);

    try {
      const deviceId = getDeviceId();

      // Consultar en Supabase si ya existe el nombre
      const { data: existing, error: selectError } = await supabase
        .from('colaboradores_activos')
        .select('*')
        .eq('nombre', finalName)
        .maybeSingle();

      if (selectError && selectError.code !== 'PGRST116') {
        console.warn('Error al consultar colaboradores_activos en Supabase:', selectError);
      }

      if (existing) {
        // Si ya existe y el device_id COINCIDE: Permitir actualizar (mismo dispositivo)
        if (existing.device_id === deviceId) {
          await supabase
            .from('colaboradores_activos')
            .update({
              avatar: selectedAvatar,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
        } else {
          // Si ya existe y el device_id NO coincide: Bloquear
          setErrorMessage(
            "El nombre o alias ya está registrado por otro colaborador. Por favor, agrega tu apellido o un diferenciador."
          );
          setIsSaving(false);
          return;
        }
      } else {
        // Si no existe: Registrar en Supabase
        await supabase
          .from('colaboradores_activos')
          .insert({
            nombre: finalName,
            avatar: selectedAvatar,
            device_id: deviceId,
            updated_at: new Date().toISOString()
          });
      }

      // Éxito: notificar y cerrar
      onSave(finalName, selectedAvatar);
    } catch (err: any) {
      console.warn('Advertencia al sincronizar colaborador en Supabase (guardando en local):', err);
      onSave(finalName, selectedAvatar);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00081d]/85 backdrop-blur-md p-4 animate-fade-in font-sans select-none overflow-y-auto">
      <div className="w-full max-w-sm bg-[#061224] border border-sky-500/30 rounded-3xl p-5 space-y-4 shadow-2xl text-white relative">
        
        {/* Botón Cierre */}
        <button
          onClick={onClose}
          disabled={isSaving}
          className="absolute top-4 right-4 p-1.5 text-sky-400 hover:text-white bg-[#0c244d] rounded-xl border border-sky-500/30 transition-colors"
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

        {/* Banner de Mensaje de Error (Nombre ya Registrado por Otro Dispositivo) */}
        {errorMessage && (
          <div className="p-3 bg-red-950/90 border border-red-500/50 rounded-2xl flex items-start space-x-2.5 text-red-200 text-xs shadow-lg animate-fade-in">
            <AlertOctagon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed font-medium">{errorMessage}</p>
          </div>
        )}

        {/* 1. Vista Previa en Vivo (80x80 px) */}
        <div className="flex flex-col items-center justify-center space-y-2 py-1">
          <div className="relative w-20 h-20 rounded-full border-2 border-sky-400/60 shadow-xl overflow-hidden bg-[#020b18] flex items-center justify-center">
            {isCompressing ? (
              <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
            ) : (
              <img
                src={selectedAvatar}
                alt="Avatar"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
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
                  className={`relative w-10 h-10 rounded-full border-2 transition-all overflow-hidden flex items-center justify-center ${
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

        {/* 4. Opción para Tomar Foto / Subir Imagen (Compresión WebP) */}
        <div className="pt-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            onChange={handleFileChange}
            className="hidden"
          />
          
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isCompressing || isSaving}
            className="w-full py-2.5 px-3 bg-[#0c244d] hover:bg-[#163a75] active:bg-[#163a75] text-sky-300 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl border border-sky-500/30 flex items-center justify-center space-x-2 transition-all shadow-md"
          >
            <Camera className="w-4 h-4 text-sky-400" />
            <span>{isCompressing ? 'Procesando Foto WebP...' : 'Tomar Foto / Subir Imagen'}</span>
          </button>
        </div>

        {/* Botones de Acción */}
        <div className="flex justify-end space-x-2 pt-2 border-t border-sky-500/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-slate-400 hover:text-white font-bold text-xs"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!tempUser.trim() || isCompressing || isSaving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/30 disabled:opacity-50 transition-all flex items-center space-x-1.5"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Verificando...</span>
              </>
            ) : (
              <span>Guardar Perfil</span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
