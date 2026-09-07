import { supabase } from '../services/supabase';

/**
 * Parsea y normaliza URLs de fotos de daño (soporta string único, array JSON, data URLs base64 o delimitado por comas)
 */
export const parseFotoUrls = (fotoUrlRaw?: string | string[] | null): string[] => {
  if (!fotoUrlRaw) return [];

  const checkUrl = (u: unknown): boolean => {
    if (typeof u !== 'string') return false;
    const clean = u.trim().toLowerCase();
    return clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('data:image/');
  };

  if (Array.isArray(fotoUrlRaw)) {
    return fotoUrlRaw.filter((u): u is string => checkUrl(u));
  }

  const str = String(fotoUrlRaw).trim();
  if (!str) return [];

  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return parsed.filter((u): u is string => checkUrl(u));
      }
    } catch {
      // Fallback si falla JSON.parse
    }
  }

  const cleanLower = str.toLowerCase();
  if (cleanLower.startsWith('http://') || cleanLower.startsWith('https://') || cleanLower.startsWith('data:image/')) {
    return [str];
  }

  return str
    .split(',')
    .map((u: string) => u.trim())
    .filter((u: string): u is string => checkUrl(u));
};

/**
 * Comprime un archivo de imagen en el cliente usando HTML5 Canvas
 * - Ancho / Alto máximo: 1080px (mantiene aspecto de la imagen)
 * - Formato: WebP con calidad 0.75 (75%)
 * - Peso resultante esperado: entre 60 KB y 100 KB por foto
 */
export const compressImage = async (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const MAX_DIMENSION = 1080;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIMENSION) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          }
        } else {
          if (height > MAX_DIMENSION) {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);

          // Generar blob WebP al 75% de calidad
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                // Fallback a JPEG al 75% de calidad si WebP no fuera generado por el navegador
                canvas.toBlob(
                  (fallbackBlob) => {
                    if (fallbackBlob) resolve(fallbackBlob);
                    else reject(new Error('Error al generar blob de la imagen comprimida'));
                  },
                  'image/jpeg',
                  0.75
                );
              }
            },
            'image/webp',
            0.75
          );
        } else {
          reject(new Error('No se pudo inicializar el contexto canvas 2D'));
        }
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

/**
 * Sube la foto comprimida a Supabase Storage en formato .webp ('evidencias-danos', 'auditoria-fotos' o 'danados')
 * Retorna la URL pública https://... directa para visualización y exportación Excel.
 */
export const uploadFotoDano = async (
  file: File,
  naeId: string,
  upc: string
): Promise<string> => {
  try {
    const compressedBlob = await compressImage(file);
    const fileName = `danos/${naeId}/${upc.trim()}_${Date.now()}_${Math.floor(Math.random() * 1000)}.webp`;
    const contentType = compressedBlob.type || 'image/webp';

    // 1. Intentar subida a bucket 'evidencias-danos'
    const { data: data0, error: error0 } = await supabase.storage
      .from('evidencias-danos')
      .upload(fileName, compressedBlob, {
        contentType,
        upsert: true
      });

    if (!error0 && data0) {
      const { data: publicUrlData0 } = supabase.storage
        .from('evidencias-danos')
        .getPublicUrl(fileName);
      if (publicUrlData0?.publicUrl) return publicUrlData0.publicUrl;
    }

    // 2. Intentar subida a bucket 'auditoria-fotos'
    const { data: data1, error: error1 } = await supabase.storage
      .from('auditoria-fotos')
      .upload(fileName, compressedBlob, {
        contentType,
        upsert: true
      });

    if (!error1 && data1) {
      const { data: publicUrlData1 } = supabase.storage
        .from('auditoria-fotos')
        .getPublicUrl(fileName);
      if (publicUrlData1?.publicUrl) return publicUrlData1.publicUrl;
    }

    // 3. Intentar subida a bucket 'danados'
    const { data: data2, error: error2 } = await supabase.storage
      .from('danados')
      .upload(fileName, compressedBlob, {
        contentType,
        upsert: true
      });

    if (!error2 && data2) {
      const { data: publicUrlData2 } = supabase.storage
        .from('danados')
        .getPublicUrl(fileName);
      if (publicUrlData2?.publicUrl) return publicUrlData2.publicUrl;
    }

    // Fallback 4: Retornar data URL comprimida directamente si los buckets no aceptan la carga
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(compressedBlob);
    });
  } catch (e) {
    console.warn('⚠️ Advertencia al comprimir/subir foto de daño:', e);
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }
};

export { purgeCamionPhotos } from '../services/storageService';

