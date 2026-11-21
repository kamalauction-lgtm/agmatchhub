import { BuildingIcon } from "./icons";
import { ListingGallery, type GalleryImage } from "./listing-gallery";

/**
 * Photos when the project has them — the same gallery the local listings use —
 * and a designed panel when it does not.
 *
 * The panel is the common case until the catalogue's photos are copied into
 * our storage, so it has to look intended: a tint, the building mark, and the
 * city in large type, with one action that leads to the enquiry form.
 */
export function InternationalGallery({
  images,
  place,
  labels,
}: {
  images: GalleryImage[];
  /** The city, or the country when the listing names no city. */
  place: string;
  labels: {
    noPhotoTitle: string;
    noPhotoBody: string;
    noPhotoCta: string;
    photoCount: string;
    openPhoto: string;
  };
}) {
  if (images.length > 0) {
    return (
      <ListingGallery
        images={images}
        labels={{
          noPhoto: labels.noPhotoTitle,
          noPhotoHelp: labels.noPhotoBody,
          photoCount: labels.photoCount,
          openPhoto: labels.openPhoto,
          askForPhotos: labels.noPhotoCta,
        }}
      />
    );
  }

  return (
    <div className="relative overflow-hidden rounded-card border border-line bg-electric-soft">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--gold-soft),transparent_60%)]"
      />
      <div className="relative grid min-h-64 place-items-center px-6 py-10 sm:aspect-[16/6] sm:min-h-0">
        <div className="flex max-w-md flex-col items-center text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-background text-electric shadow-card">
            <BuildingIcon className="h-8 w-8" />
          </span>
          <p className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">{place}</p>
          <p className="mt-2 text-sm font-semibold text-muted-strong">{labels.noPhotoTitle}</p>
          <p className="mt-1 text-sm text-muted">{labels.noPhotoBody}</p>
          <a
            href="#enquiry"
            className="mt-5 inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-electric/30 bg-background px-4 text-sm font-semibold text-electric transition-colors duration-200 hover:bg-electric hover:text-white"
          >
            {labels.noPhotoCta}
          </a>
        </div>
      </div>
    </div>
  );
}
