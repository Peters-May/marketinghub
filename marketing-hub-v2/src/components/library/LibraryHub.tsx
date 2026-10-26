"use client";

import dynamic from "next/dynamic";
import { BrandGuidelinesPanel } from "@/components/brand/BrandGuidelinesPanel";
import { ResourcesClient } from "@/components/resources/ResourcesClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentFilter } from "@/components/ui/SegmentFilter";
import { ModuleSkeleton } from "@/components/ui/ModuleSkeleton";
import { useHubView } from "@/lib/hub-view";
import type { FieldOption } from "@/lib/data/collections";
import type { ResourceLink } from "@/lib/types";
import { useState } from "react";

const MediaGallery = dynamic(
  () =>
    import("@/components/media/MediaGallery").then((m) => ({
      default: m.MediaGallery,
    })),
  { loading: () => <ModuleSkeleton rows={12} /> }
);

type Tab = "media" | "brand" | "resources";

const ALL_TABS: { id: Tab; label: string }[] = [
  { id: "media", label: "Media" },
  { id: "brand", label: "Brand" },
  { id: "resources", label: "Resources" },
];

export function LibraryHub({
  resources,
  logoUrl,
  guideUrl,
  resourceFieldOptions,
}: {
  resources: ResourceLink[];
  logoUrl: string;
  guideUrl: string;
  resourceFieldOptions?: Record<string, FieldOption[]>;
}) {
  const [tab, setTab] = useState<Tab>("media");
  const { view } = useHubView();
  const isExternal = view === "external";
  const isMember = view === "member";
  const canManage = view === "admin";
  const showResources = view === "admin" || view === "member";
  const tabs = showResources
    ? ALL_TABS
    : ALL_TABS.filter((item) => item.id !== "resources");
  const activeTab = tab === "resources" && !showResources ? "media" : tab;

  if (isExternal) {
    return (
      <div>
        <PageHeader
          title="Library"
          description="External view — logos, presentations, and gallery, matching the public media gallery."
        />
        <MediaGallery
          title="Media gallery"
          description="Browse logos, presentations, and gallery — view freely, sign in to download."
          showStaffChrome={false}
          initialCanDownload
          hideHeader
          scope="public"
          allowManage={false}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Library"
        description={
          isMember
            ? "Browse and download brand assets, guidelines, and useful links."
            : "Brand assets, guidelines, and useful links — one place for the team."
        }
      />

      <SegmentFilter
        label="Library section"
        value={activeTab}
        onChange={setTab}
        options={tabs}
        size="lg"
        tourIdPrefix="library-tab"
      />

      {activeTab === "media" ? (
        <MediaGallery
          title="Media"
          description="Logos, presentations, gallery, business cards, and other brand assets."
          initialCanDownload
          hideHeader
          scope="all"
          allowManage={canManage}
          showAdminOnly={canManage}
        />
      ) : null}

      {activeTab === "brand" ? (
        <BrandGuidelinesPanel
          logoUrl={logoUrl}
          guideUrl={guideUrl}
          showDownloads
        />
      ) : null}

      {activeTab === "resources" && showResources ? (
        <ResourcesClient
          initial={resources}
          hideHeader
          allowManage={canManage}
          fieldOptions={resourceFieldOptions}
        />
      ) : null}
    </div>
  );
}
