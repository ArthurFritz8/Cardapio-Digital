"use client";

import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorText, Input, Label, Textarea } from "@/components/ui";
import { useGeolocation } from "@/hooks/useGeolocation";
import { slugify } from "@/lib/slug";
import { uploadImage } from "@/lib/storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { establishmentSchema } from "@/schemas/menu";
import type { Establishment } from "@/types/domain";

interface EstablishmentFormProps {
  mode: "create" | "edit";
  initial?: Establishment;
}

export function EstablishmentForm({ mode, initial }: EstablishmentFormProps) {
  const router = useRouter();
  const geolocation = useGeolocation();

  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isOpen, setIsOpen] = useState(initial?.is_open ?? true);
  const [latitude, setLatitude] = useState<string>(
    initial?.latitude?.toString() ?? "",
  );
  const [longitude, setLongitude] = useState<string>(
    initial?.longitude?.toString() ?? "",
  );
  const [radius, setRadius] = useState<string>(
    (initial?.order_radius_meters ?? 150).toString(),
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleUseLocation() {
    const position = await geolocation.request();
    if (!position) {
      setError(
        "Não foi possível obter sua localização. Preencha manualmente ou tente de novo.",
      );
      return;
    }
    setError(null);
    setLatitude(position.latitude.toFixed(6));
    setLongitude(position.longitude.toFixed(6));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const lat = latitude.trim() === "" ? null : Number(latitude);
    const lng = longitude.trim() === "" ? null : Number(longitude);
    if ((lat === null) !== (lng === null)) {
      setError("Preencha latitude E longitude, ou deixe ambas vazias.");
      return;
    }

    const parsed = establishmentSchema.safeParse({
      name,
      slug,
      description: description.trim() || null,
      is_open: isOpen,
      latitude: lat,
      longitude: lng,
      order_radius_meters: Number(radius),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }

    setSaving(true);
    const supabase = createSupabaseBrowserClient();

    try {
      if (mode === "create") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Sessão expirada");

        const { data: created, error: insertError } = await supabase
          .from("establishments")
          .insert({ ...parsed.data, owner_id: user.id })
          .select("id")
          .single();
        if (insertError) throw insertError;

        if (logoFile) {
          const logoUrl = await uploadImage(supabase, logoFile, created.id, "logo");
          await supabase
            .from("establishments")
            .update({ logo_url: logoUrl })
            .eq("id", created.id);
        }
        router.push("/admin");
      } else if (initial) {
        let logoUrl = initial.logo_url;
        if (logoFile) {
          logoUrl = await uploadImage(supabase, logoFile, initial.id, "logo");
        }
        const { error: updateError } = await supabase
          .from("establishments")
          .update({ ...parsed.data, logo_url: logoUrl })
          .eq("id", initial.id);
        if (updateError) throw updateError;
      }
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        message.includes("duplicate") || message.includes("23505")
          ? "Este endereço (slug) já está em uso. Escolha outro."
          : message || "Não foi possível salvar. Tente novamente.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Nome do estabelecimento</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="slug">Endereço público (slug)</Label>
        <Input
          id="slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(slugify(e.target.value));
          }}
          placeholder="bar-do-ze"
          required
        />
      </div>
      <div>
        <Label htmlFor="description">Descrição (opcional)</Label>
        <Textarea
          id="description"
          rows={2}
          maxLength={300}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="logo">Logo (opcional — JPG/PNG/WebP)</Label>
        <Input
          id="logo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <fieldset className="space-y-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">
          Localização (anti pedido-fantasma — opcional)
        </legend>
        <p className="text-xs text-neutral-500">
          Com a localização preenchida, pedidos feitos longe do bar chegam
          marcados para confirmação do garçom.
        </p>
        <Button variant="ghost" onClick={handleUseLocation} className="w-full">
          <MapPin className="h-4 w-4" aria-hidden />
          {geolocation.status === "loading"
            ? "Obtendo localização..."
            : "Usar minha localização atual"}
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="latitude">Latitude</Label>
            <Input
              id="latitude"
              inputMode="decimal"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="-23.550500"
            />
          </div>
          <div>
            <Label htmlFor="longitude">Longitude</Label>
            <Input
              id="longitude"
              inputMode="decimal"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="-46.633300"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="radius">Raio aceito sem confirmação (metros)</Label>
          <Input
            id="radius"
            type="number"
            min={30}
            max={1000}
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
          />
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isOpen}
          onChange={(e) => setIsOpen(e.target.checked)}
          className="h-4 w-4 accent-brand-500"
        />
        Aberto para pedidos
      </label>

      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={saving} className="w-full">
        {saving
          ? "Salvando..."
          : mode === "create"
            ? "Criar estabelecimento"
            : "Salvar alterações"}
      </Button>
    </form>
  );
}
