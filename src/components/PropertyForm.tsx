import type { Property } from "@prisma/client";
import ImageUploader from "./ImageUploader";

// A plain server-rendered form (no client JS needed) — posts to a server action.
export default function PropertyForm({
  property,
  action,
  isNew
}: {
  property?: Property;
  action: (formData: FormData) => void;
  isNew: boolean;
}) {
  const amenities: string[] = property ? JSON.parse(property.amenities || "[]") : [];
  const images: string[] = property ? JSON.parse(property.images || "[]") : [];

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {isNew && (
        <Field label="URL slug (leave blank to auto-generate from name)">
          <input name="slug" className="input" placeholder="lakeside-cabin" />
        </Field>
      )}

      <Field label="Property name">
        <input name="name" required defaultValue={property?.name} className="input" />
      </Field>

      <Field label="Tagline">
        <input
          name="tagline"
          defaultValue={property?.tagline}
          placeholder="A quiet cabin on the water"
          className="input"
        />
      </Field>

      <Field label="Description">
        <textarea
          name="description"
          rows={5}
          defaultValue={property?.description}
          className="input"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Address">
          <input name="address" defaultValue={property?.address} className="input" />
        </Field>
        <Field label="City">
          <input name="city" defaultValue={property?.city} className="input" />
        </Field>
        <Field label="State">
          <input name="state" defaultValue={property?.state} className="input" />
        </Field>
        <Field label="Country">
          <input name="country" defaultValue={property?.country || "US"} className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Field label="Max guests">
          <input
            type="number"
            name="maxGuests"
            min={1}
            defaultValue={property?.maxGuests || 2}
            className="input"
          />
        </Field>
        <Field label="Bedrooms">
          <input
            type="number"
            name="bedrooms"
            min={0}
            defaultValue={property?.bedrooms || 1}
            className="input"
          />
        </Field>
        <Field label="Beds">
          <input
            type="number"
            name="beds"
            min={0}
            defaultValue={property?.beds || 1}
            className="input"
          />
        </Field>
        <Field label="Baths">
          <input
            type="number"
            step="0.5"
            name="baths"
            min={0}
            defaultValue={property?.baths || 1}
            className="input"
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Nightly rate (USD)">
          <input
            type="number"
            step="0.01"
            name="basePrice"
            defaultValue={property ? property.basePrice / 100 : ""}
            className="input"
          />
        </Field>
        <Field label="Cleaning fee (USD)">
          <input
            type="number"
            step="0.01"
            name="cleaningFee"
            defaultValue={property ? property.cleaningFee / 100 : 0}
            className="input"
          />
        </Field>
        <Field label="Tax rate (%)">
          <input
            type="number"
            step="0.01"
            name="taxRate"
            defaultValue={property ? property.taxRate * 100 : 0}
            className="input"
          />
        </Field>
      </div>

      <Field label="Minimum nights">
        <input
          type="number"
          name="minNights"
          min={1}
          defaultValue={property?.minNights || 2}
          className="input w-32"
        />
      </Field>

      <Field label="Amenities (comma-separated)">
        <input name="amenities" defaultValue={amenities.join(", ")} className="input" />
      </Field>

      <Field label="Photos">
        <ImageUploader />
      </Field>

      <Field label="Image URLs (one per line, first is the cover photo)">
        <textarea id="images-textarea" name="images" rows={4} defaultValue={images.join("\n")} className="input" />
      </Field>

      {!isNew && (
        <Field label="">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={property?.active} />
            Published (visible on the public site)
          </label>
        </Field>
      )}

      <button type="submit" className="btn-primary">
        {isNew ? "Create property" : "Save changes"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label && <label className="block text-sm mb-1">{label}</label>}
      {children}
    </div>
  );
}
