import { supabase } from './supabase';
import { parseFotoUrls } from '../utils/imageCompressor';

export interface PurgeResult {
  success: boolean;
  purgedCount: number;
  bucketsPurged: Record<string, number>;
}

/**
 * Purga físicamente del Storage de Supabase todas las fotos asociadas a un camión/auditoría.
 * Lista y elimina archivos bajo las rutas 'danos/${camionId}/' y '${camionId}/' en 'evidencias-danos'
 * y buckets secundarios ('auditoria-fotos', 'danados').
 * 
 * @param camionId ID del camión / NAE
 */
export const purgeCamionPhotos = async (camionId: string | number): Promise<PurgeResult> => {
  const strId = String(camionId).trim();
  if (!strId) {
    return { success: false, purgedCount: 0, bucketsPurged: {} };
  }

  const buckets = ['evidencias-danos', 'auditoria-fotos', 'danados'];
  let totalPurged = 0;
  const bucketsPurged: Record<string, number> = {};

  try {
    // 1. Intentar obtener URLs de fotos guardadas en auditoria_items para no omitir ninguna ruta
    let dbPhotoUrls: string[] = [];
    try {
      const { data: items } = await supabase
        .from('auditoria_items')
        .select('foto_dano_url, foto_upc_url, foto_frente_url')
        .eq('nae_id', strId);

      if (items && items.length > 0) {
        dbPhotoUrls = items.flatMap(it => [
          ...parseFotoUrls(it.foto_dano_url),
          ...parseFotoUrls(it.foto_upc_url),
          ...parseFotoUrls(it.foto_frente_url),
        ]);
      }
    } catch (e) {
      console.warn(`[purgeCamionPhotos] No se pudieron obtener URLs de fotos de auditoria_items para NAE ${strId}:`, e);
    }

    for (const bucket of buckets) {
      const filePathsToPurge: string[] = [];

      // 2. Listar archivos en la carpeta 'danos/${strId}'
      try {
        const { data: listDanos, error: errDanos } = await supabase.storage
          .from(bucket)
          .list(`danos/${strId}`, { limit: 1000 });

        if (!errDanos && listDanos && listDanos.length > 0) {
          listDanos.forEach(file => {
            if (file.name) {
              filePathsToPurge.push(`danos/${strId}/${file.name}`);
            }
          });
        }
      } catch (err) {
        console.warn(`[purgeCamionPhotos] Error al listar 'danos/${strId}' en bucket '${bucket}':`, err);
      }

      // 2b. Listar archivos en la carpeta 'desconocidos/${strId}'
      try {
        const { data: listDesc, error: errDesc } = await supabase.storage
          .from(bucket)
          .list(`desconocidos/${strId}`, { limit: 1000 });

        if (!errDesc && listDesc && listDesc.length > 0) {
          listDesc.forEach(file => {
            if (file.name) {
              filePathsToPurge.push(`desconocidos/${strId}/${file.name}`);
            }
          });
        }
      } catch (err) {
        console.warn(`[purgeCamionPhotos] Error al listar 'desconocidos/${strId}' en bucket '${bucket}':`, err);
      }


      // 3. Listar archivos en la carpeta '${strId}' directamente
      try {
        const { data: listDirect, error: errDirect } = await supabase.storage
          .from(bucket)
          .list(strId, { limit: 1000 });

        if (!errDirect && listDirect && listDirect.length > 0) {
          listDirect.forEach(file => {
            if (file.name) {
              filePathsToPurge.push(`${strId}/${file.name}`);
            }
          });
        }
      } catch (err) {
        console.warn(`[purgeCamionPhotos] Error al listar '${strId}' en bucket '${bucket}':`, err);
      }

      // 4. Extraer rutas relativas desde dbPhotoUrls para este bucket
      if (dbPhotoUrls.length > 0) {
        const bucketMarker = `/${bucket}/`;
        dbPhotoUrls.forEach(url => {
          if (url.includes(bucketMarker)) {
            const relPath = url.substring(url.indexOf(bucketMarker) + bucketMarker.length);
            if (relPath) {
              filePathsToPurge.push(relPath);
            }
          }
        });
      }

      // Filtrar rutas únicas
      const uniquePaths = Array.from(new Set(filePathsToPurge));

      if (uniquePaths.length > 0) {
        console.log(`🔥 Purgando ${uniquePaths.length} fotos en bucket '${bucket}' para NAE ${strId}...`, uniquePaths);
        const { error: removeError } = await supabase.storage
          .from(bucket)
          .remove(uniquePaths);

        if (removeError) {
          console.error(`❌ Error al remover fotos en bucket '${bucket}':`, removeError);
        } else {
          bucketsPurged[bucket] = uniquePaths.length;
          totalPurged += uniquePaths.length;
        }
      } else {
        bucketsPurged[bucket] = 0;
      }
    }

    return { success: true, purgedCount: totalPurged, bucketsPurged };
  } catch (globalError) {
    console.error(`[purgeCamionPhotos] Error crítico durante la purga del camión ${strId}:`, globalError);
    return { success: false, purgedCount: totalPurged, bucketsPurged };
  }
};
