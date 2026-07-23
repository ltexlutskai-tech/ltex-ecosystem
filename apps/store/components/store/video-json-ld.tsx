import { extractYouTubeId } from "@/lib/youtube";

/**
 * VideoObject JSON-LD для сторінок з YouTube-відеооглядом (товар/лот).
 *
 * SEO: ~95% товарів L-TEX мають відеоогляд — розмітка дає шанс на відео-сніпет
 * у Google (мініатюра відео в результатах) БЕЗ розкриття цін. Рендеримо лише
 * коли з URL вдалось дістати YouTube id.
 */
interface Props {
  /** Назва товару/лота — стане назвою відео. */
  name: string;
  /** Опис (fallback — згенерований). */
  description?: string | null;
  /** YouTube-посилання (watch/youtu.be/embed). */
  videoUrl: string | null | undefined;
  /** Дата завантаження (ISO). Google вимагає uploadDate — передаємо найближчу
   *  відому дату (дата відео лота або оновлення товару). */
  uploadDate: string;
}

export function VideoJsonLd({
  name,
  description,
  videoUrl,
  uploadDate,
}: Props) {
  const id = extractYouTubeId(videoUrl);
  if (!id) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: `Відеоогляд: ${name}`,
    description:
      description?.trim() ||
      `Відеоогляд «${name}» — вміст мішка на відео. L-TEX: секонд хенд, сток, іграшки та Bric-a-Brac гуртом від 10 кг.`,
    thumbnailUrl: [
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    ],
    uploadDate,
    embedUrl: `https://www.youtube.com/embed/${id}`,
    contentUrl: `https://www.youtube.com/watch?v=${id}`,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
