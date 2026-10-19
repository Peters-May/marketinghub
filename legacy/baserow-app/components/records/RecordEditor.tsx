"use client"

/**
 * RecordEditor — unified core component for record editing across all surfaces.
 * Renders in different modes: modal (full edit), review (read-first, lightweight).
 * Grid inline editing uses CellFactory, NOT RecordEditor.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Maximize2, ChevronDown, ChevronRight, ArrowLeft, Save, Trash2, X, Copy, ExternalLink, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChoicePill } from "@/components/fields/ChoicePill"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import FieldEditor from "@/components/fields/FieldEditor"
import InlineFieldEditor from "@/components/records/InlineFieldEditor"
import RecordFields from "@/components/records/RecordFields"
import RecordActivity from "@/components/records/RecordActivity"
import RecordComments from "@/components/records/RecordComments"
import { useRecordEditorCore, type RecordEditorCascadeContext } from "@/lib/interface/record-editor-core"
import type { FieldLayoutItem } from "@/lib/interface/field-layout-utils"
import {
  getVisibleFieldsFromLayout,
  isFieldEditableFromLayout,
  getFieldGroupsFromLayout,
  convertModalLayoutToFieldLayout,
  convertModalFieldsToFieldLayout,
} from "@/lib/interface/field-layout-helpers"
import { getPrimaryFieldName } from "@/lib/fields/primary"
import { sectionAndSortFields } from "@/lib/fields/sectioning"
import { useSelectionContext } from "@/contexts/SelectionContext"
import { useRecordPanel } from "@/contexts/RecordPanelContext"
import { useUIMode } from "@/contexts/UIModeContext"
import { useToast } from "@/components/ui/use-toast"
import { isAbortError } from "@/lib/api/error-handling"
import { createClient } from "@/lib/supabase/client"
import type { TableField } from "@/types/fields"
import { resolveRecordLayout } from "@/lib/records/record-layout-resolver"
import type { RecordLayoutType } from "@/lib/records/record-layout-presets"
import {
  usesContextualDrawerView,
  type EventRecordContextualPayload,
  type RecordDrawerMode,
} from "@/lib/records/record-drawer-mode"
import EventRecordContextualView from "@/components/records/EventRecordContextualView"
import { createDraftRecordStorageId } from "@/lib/records/draft-record-storage-id"
import { cn } from "@/lib/utils"

function extractUrlLike(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed
    return null
  }
  if (Array.isArray(value) && value.length > 0) return extractUrlLike(value[0])
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>
    return extractUrlLike(candidate.url ?? candidate.href ?? candidate.src ?? null)
  }
  return null
}

export interface RecordEditorProps {
  recordId: string | null
  tableId: string
  mode: "inline" | "modal" | "review"
  fieldLayoutConfig?: FieldLayoutItem[] | null
  tableFields?: TableField[] | null
  supabaseTableName?: string | null
  cascadeContext?: RecordEditorCascadeContext | null
  initialData?: Record<string, any>
  /** Only load when true (e.g. modal/panel open) */
  active?: boolean
  onSave?: (createdRecordId?: string | null) => void
  onDeleted?: () => void | Promise<void>
  /** Modal shell: called when user clicks Back, Cancel, or Close */
  onClose?: () => void
  /** Modal-only: layout editing */
  canEditLayout?: boolean
  onLayoutSave?: (layout: FieldLayoutItem[]) => void | Promise<void>
  /** Review-only: "Open in modal" callback */
  onOpenModal?: () => void
  /** Review-only: called when user duplicates record, with new record id */
  onRecordDuplicate?: (newRecordId: string) => void
  /** Modal-only: show comments in footer */
  showComments?: boolean
  /** Modal-only: show fields grouped by sections */
  showFieldSections?: boolean
  /** Modal-only: skip RecordFields, use flat FieldEditor list */
  forceFlatLayout?: boolean
  /** Interface mode: 'edit' allows layout editing when canEditLayout */
  interfaceMode?: "view" | "edit"
  recordLayoutType?: RecordLayoutType
  recordDrawerMode?: RecordDrawerMode
  eventContextual?: EventRecordContextualPayload | null
  onRecordDrawerModeChange?: (mode: RecordDrawerMode) => void
  /** For modal: render header actions (close, delete, save) - set false when shell provides them */
  renderHeaderActions?: boolean
  /** @deprecated Use fieldLayoutConfig. Backward compat: custom modal layout. */
  modalLayout?: { blocks?: Array<{ fieldName?: string; y?: number; config?: any }> }
  /** @deprecated Use fieldLayoutConfig. Backward compat: field names to show. */
  modalFields?: string[]
  /** Visibility context for field_layout: 'modal' (default) or 'canvas' (RecordDetailPanelInline). */
  visibilityContext?: "modal" | "canvas"
  /** Override: when false, fields are read-only regardless of permissions. Used by RecordDetailPanelInline. */
  allowEdit?: boolean
  /** Optional content to render below comments in review mode (e.g. InterfaceBuilder blocks). */
  renderExtraContent?: React.ReactNode
  /** Called after a field is successfully persisted; use to refresh parent UI (e.g. cards, list). */
  onRecordUpdate?: (recordId: string, fieldName: string, value: any) => void
}

export default function RecordEditor({
  recordId,
  tableId,
  mode,
  fieldLayoutConfig,
  tableFields,
  supabaseTableName,
  cascadeContext,
  initialData,
  active = true,
  onSave,
  onDeleted,
  onClose,
  canEditLayout = false,
  onLayoutSave,
  onOpenModal,
  onRecordDuplicate,
  showComments = true,
  showFieldSections = false,
  forceFlatLayout = false,
  interfaceMode = "view",
  recordLayoutType,
  recordDrawerMode = "edit",
  eventContextual = null,
  onRecordDrawerModeChange,
  renderHeaderActions = true,
  modalLayout,
  modalFields = [],
  visibilityContext = "modal",
  allowEdit = true,
  renderExtraContent,
  onRecordUpdate,
}: RecordEditorProps) {
  const { selectedContext, setSelectedContext } = useSelectionContext()
  const { isEdit } = useUIMode()
  const { toast } = useToast()
  const {
    setFieldLayout: setLiveFieldLayout,
    setRecordDrawerMode,
    navigateToLinkedRecord,
    openRecordByTableId,
    state: recordPanelState,
  } = useRecordPanel()

  const core = useRecordEditorCore({
    tableId,
    recordId,
    supabaseTableName,
    tableFields: tableFields ?? undefined,
    fieldLayout: fieldLayoutConfig ?? undefined,
    modalLayout: fieldLayoutConfig?.length ? undefined : modalLayout,
    modalFields: fieldLayoutConfig?.length ? undefined : modalFields,
    visibilityContext,
    initialData,
    active,
    cascadeContext,
    onSave,
    onDeleted,
    saveOnFieldChange: true,
    onRecordUpdate,
  })

  const {
    loading,
    formData,
    fields: filteredFields,
    allFields,
    effectiveTableName,
    saving,
    deleting,
    save,
    deleteRecord,
    handleFieldChange,
    handleFieldBlur,
    canEditRecords,
    canCreateRecords,
    canDeleteRecords,
    saveOnFieldChange,
    isDirty,
    hasDraftToRestore,
    restoreDraft,
    clearDraft,
    discardChanges,
    refreshFields,
  } = core

  const canSave = recordId ? canEditRecords : canCreateRecords
  const draftStorageIdRef = useRef(createDraftRecordStorageId())
  const attachmentStorageId = recordId ?? draftStorageIdRef.current
  const isCustomMarketingLayout = Boolean(
    recordLayoutType && recordLayoutType !== "generic"
  )
  const showEventContextualView =
    mode === "review" &&
    usesContextualDrawerView(recordLayoutType, recordDrawerMode) &&
    Boolean(eventContextual?.event)
  // Custom marketing layouts: fields editable only in drawer edit mode (generic stays Airtable-style).
  const effectiveEditable =
    !allowEdit
      ? false
      : isCustomMarketingLayout
        ? recordDrawerMode === "edit" && canSave
        : canSave
  const [contentReady, setContentReady] = useState(false)
  const contentReadyRef = useRef(false)

  useEffect(() => {
    if (!isDirty) return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = "You have unsaved changes. Leave anyway?"
      return "You have unsaved changes. Leave anyway?"
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    const ready =
      !loading &&
      (filteredFields.length === 0
        ? false
        : recordId
          ? formData != null && Object.keys(formData).length > 0
          : true)
    if (ready && !contentReadyRef.current) {
      contentReadyRef.current = true
      setContentReady(true)
    }
    if (!active || loading) {
      contentReadyRef.current = false
      setContentReady(false)
    }
  }, [active, loading, recordId, formData, filteredFields.length])

  const permissions = (cascadeContext?.blockConfig as any)?.permissions ?? (cascadeContext?.pageConfig as any)?.permissions ?? {}
  const isViewOnly = permissions.mode === "view"
  // Comments stay available in view mode. Field editing still follows the drawer mode.
  const canComment = allowEdit && !isViewOnly && Boolean(recordId && canEditRecords)

  const recordTitle = useMemo(() => {
    if (!recordId || !formData) return null
    const primaryName = getPrimaryFieldName(filteredFields)
    if (primaryName && formData[primaryName] != null && formData[primaryName] !== "") {
      return String(formData[primaryName])
    }
    return null
  }, [recordId, formData, filteredFields])

  const resolvedFieldLayout = useMemo(() => {
    if (fieldLayoutConfig && fieldLayoutConfig.length > 0) return fieldLayoutConfig
    if (modalLayout?.blocks && modalLayout.blocks.length > 0 && allFields.length > 0) {
      return convertModalLayoutToFieldLayout(modalLayout, allFields)
    }
    if (modalFields && modalFields.length > 0 && allFields.length > 0) {
      return convertModalFieldsToFieldLayout(modalFields, allFields)
    }
    return []
  }, [fieldLayoutConfig, modalLayout, modalFields, allFields])

  const visibleFields = useMemo(() => {
    if (!recordId || resolvedFieldLayout.length === 0) return filteredFields
    return getVisibleFieldsFromLayout(resolvedFieldLayout, filteredFields, visibilityContext)
  }, [recordId, resolvedFieldLayout, filteredFields, visibilityContext])

  const fieldGroups = useMemo(() => {
    if (!recordId || resolvedFieldLayout.length === 0) return {}
    return getFieldGroupsFromLayout(resolvedFieldLayout, filteredFields, visibilityContext)
  }, [recordId, resolvedFieldLayout, filteredFields, visibilityContext])

  const filteredFieldsIdSig = useMemo(
    () => filteredFields.map((f) => f.id).join(","),
    [filteredFields]
  )

  const customLayout = useMemo(
    () => resolveRecordLayout(filteredFields, recordLayoutType),
    [filteredFields, recordLayoutType]
  )
  const useCustomLayout =
    mode === "review" &&
    customLayout.isCustom &&
    customLayout.sections.length > 0 &&
    !showEventContextualView
  const showTaskActivityTab =
    useCustomLayout &&
    recordLayoutType === "task" &&
    mode === "review" &&
    Boolean(recordId)
  const customLayoutReadOnly = isCustomMarketingLayout
    ? recordDrawerMode === "view"
    : interfaceMode === "view"
  const customEditLabel =
    recordLayoutType === "event"
      ? "Edit event"
      : recordLayoutType === "social_post"
        ? "Edit post"
        : recordLayoutType === "task"
          ? "Edit task"
          : recordLayoutType === "campaign"
            ? "Edit campaign"
            : recordLayoutType === "content"
              ? "Edit content"
              : recordLayoutType === "asset"
                ? "Edit details"
                : "Edit"
  const [activeCustomTab, setActiveCustomTab] = useState<string>("overview")
  const mediaPreviewValue =
    customLayout.mediaPreviewField && formData
      ? formData[customLayout.mediaPreviewField.name]
      : null

  const [localFieldLayout, setLocalFieldLayout] = useState<FieldLayoutItem[]>([])
  const resolvedLayoutSignatureRef = useRef<string>("")
  useEffect(() => {
    const visKey = visibilityContext === "canvas" ? "visible_in_canvas" : "visible_in_modal"
    const sig = JSON.stringify(resolvedFieldLayout.map((i) => [i.field_name, i.order, (i as any)[visKey]]))
    if (resolvedLayoutSignatureRef.current === sig) return
    resolvedLayoutSignatureRef.current = sig
    setLocalFieldLayout(resolvedFieldLayout)
  }, [resolvedFieldLayout, visibilityContext])

  const isEditingLayout =
    isEdit() &&
    canEditLayout &&
    !isViewOnly &&
    Boolean(onLayoutSave) &&
    !!recordId
  const layoutFieldsSource = localFieldLayout.length > 0 ? localFieldLayout : resolvedFieldLayout
  const layoutModeFields = useMemo(() => {
    if (!isEditingLayout || layoutFieldsSource.length === 0) return visibleFields
    const fieldMap = new Map<string, TableField>()
    filteredFields.forEach((f) => {
      fieldMap.set(f.name, f)
      fieldMap.set(f.id, f)
    })
    const ordered = [...layoutFieldsSource].sort((a, b) => a.order - b.order)
    const result: TableField[] = []
    const seen = new Set<string>()
    ordered.forEach((item) => {
      const field = fieldMap.get(item.field_name) || fieldMap.get(item.field_id)
      if (field && !seen.has(field.id)) {
        result.push(field)
        seen.add(field.id)
      }
    })
    return result.length > 0 ? result : visibleFields
  }, [isEditingLayout, layoutFieldsSource, filteredFields, visibleFields])

  const isFieldEditable = useCallback(
    (fieldName: string) => {
      if (!effectiveEditable) return false
      if (!recordId || resolvedFieldLayout.length === 0) return effectiveEditable
      return isFieldEditableFromLayout(fieldName, resolvedFieldLayout, effectiveEditable)
    },
    [effectiveEditable, recordId, resolvedFieldLayout]
  )

  const handleFieldLabelClick = useCallback(
    (fieldId: string) => {
      if (isEditingLayout) return
      setSelectedContext({ type: "field", fieldId, tableId })
    },
    [setSelectedContext, tableId, isEditingLayout]
  )


  const handleFieldLayoutChange = useCallback(
    (newLayout: FieldLayoutItem[]) => {
      setLocalFieldLayout(newLayout)
      setLiveFieldLayout(newLayout)
      onLayoutSave?.(newLayout)
    },
    [onLayoutSave, setLiveFieldLayout]
  )

  const handleFieldVisibilityToggle = useCallback(
    (fieldName: string, visible: boolean) => {
      const key = visibilityContext === "canvas" ? "visible_in_canvas" : "visible_in_modal"
      const updated = localFieldLayout.map((item) =>
        item.field_name === fieldName ? { ...item, [key]: visible } : item
      )
      setLocalFieldLayout(updated)
      setLiveFieldLayout(updated)
      onLayoutSave?.(updated)
    },
    [localFieldLayout, onLayoutSave, visibilityContext, setLiveFieldLayout]
  )

  const handleFieldSelect = useCallback(
    (fieldId: string) => {
      setSelectedContext({ type: "field", fieldId, tableId })
    },
    [setSelectedContext, tableId]
  )

  const handleFieldSpanToggle = useCallback(
    (fieldName: string) => {
      const updated = localFieldLayout.map((item) => {
        if (item.field_name !== fieldName) return item
        const newSpan = (item.modal_column_span === 2 ? 1 : 2) as 1 | 2
        return {
          ...item,
          modal_column_span: newSpan,
          // When shrinking to single column, assign to col-1 if currently full-width
          ...(newSpan === 1 && item.modal_column_span === 2
            ? { modal_column_id: item.modal_column_id || "col-1" }
            : {}),
        }
      })
      setLocalFieldLayout(updated)
      setLiveFieldLayout(updated)
      onLayoutSave?.(updated)
    },
    [localFieldLayout, onLayoutSave, setLiveFieldLayout]
  )

  const prevInterfaceModeRef = useRef(interfaceMode)
  useEffect(() => {
    if (prevInterfaceModeRef.current === "edit" && interfaceMode !== "edit") {
      onLayoutSave?.(localFieldLayout)
    }
    prevInterfaceModeRef.current = interfaceMode
  }, [interfaceMode, localFieldLayout, onLayoutSave])

  const sectionedFields = useMemo(() => {
    if (!showFieldSections) return null
    return sectionAndSortFields(filteredFields)
  }, [filteredFields, showFieldSections])

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set())

  const defaultCustomCollapsedIds = useMemo(() => {
    if (!useCustomLayout) return [] as string[]
    return customLayout.sections
      .filter((section) => section.collapsedByDefault)
      .map((section) => section.id)
  }, [useCustomLayout, recordId, recordLayoutType, filteredFieldsIdSig])

  const customLayoutCollapseInitSig = useMemo(
    () => `${recordId ?? ""}:${recordLayoutType ?? "generic"}:${filteredFieldsIdSig}`,
    [recordId, recordLayoutType, filteredFieldsIdSig]
  )

  const customLayoutSectionIdsSig = useMemo(() => {
    if (!useCustomLayout) return ""
    return customLayout.sections.map((section) => section.id).join(",")
  }, [useCustomLayout, customLayoutCollapseInitSig, defaultCustomCollapsedIds])

  const customLayoutCollapseInitRef = useRef("")

  // Initialise collapsed sections when record/layout changes only — never depend on
  // customLayout.sections (new array every resolve) or React #185 update loops occur.
  useEffect(() => {
    if (!useCustomLayout) {
      customLayoutCollapseInitRef.current = ""
      return
    }
    if (customLayoutCollapseInitRef.current === customLayoutCollapseInitSig) return
    customLayoutCollapseInitRef.current = customLayoutCollapseInitSig
    const defaults = new Set(defaultCustomCollapsedIds)
    setCollapsedSections((prev) => {
      if (prev.size === defaults.size && [...prev].every((id) => defaults.has(id))) {
        return prev
      }
      return defaults
    })
  }, [useCustomLayout, customLayoutCollapseInitSig, defaultCustomCollapsedIds])

  useEffect(() => {
    if (!useCustomLayout) return
    if (recordLayoutType === "asset") {
      setActiveCustomTab((prev) =>
        ["details", "usage", "activity"].includes(prev) ? prev : "details"
      )
      return
    }
    const baseSectionIds = customLayoutSectionIdsSig
      ? customLayoutSectionIdsSig.split(",")
      : []
    const first = showTaskActivityTab ? "task" : baseSectionIds[0]
    if (!first) return
    setActiveCustomTab((prev) =>
      showTaskActivityTab
        ? ["task", "ownership", "linked", "activity"].includes(prev)
          ? prev
          : first
        : baseSectionIds.includes(prev)
          ? prev
          : first
    )
  }, [
    useCustomLayout,
    customLayoutCollapseInitSig,
    showTaskActivityTab,
    customLayoutSectionIdsSig,
    recordLayoutType,
  ])

  const handleLinkedRecordClick = useCallback(
    async (linkedTableId: string, linkedRecordId: string) => {
      try {
        if (linkedTableId === tableId && linkedRecordId === recordId) return
        const supabase = createClient()
        const { data: linkedTable } = await supabase
          .from("tables")
          .select("name, supabase_table")
          .eq("id", linkedTableId)
          .single()
        const panelInterfaceMode = recordPanelState.interfaceMode ?? interfaceMode ?? "view"
        if (linkedTable) {
          navigateToLinkedRecord(
            linkedTableId,
            linkedRecordId,
            linkedTable.supabase_table,
            panelInterfaceMode
          )
        } else {
          await openRecordByTableId(linkedTableId, linkedRecordId, panelInterfaceMode)
        }
      } catch (e: any) {
        toast({
          title: "Failed to open linked record",
          description: e?.message || "Please try again",
          variant: "destructive",
        })
      }
    },
    [
      tableId,
      recordId,
      recordPanelState.interfaceMode,
      interfaceMode,
      navigateToLinkedRecord,
      openRecordByTableId,
      toast,
    ]
  )

  const handleCustomDiscard = useCallback(() => {
    discardChanges()
    if (isCustomMarketingLayout) {
      setRecordDrawerMode("view")
      onRecordDrawerModeChange?.("view")
    }
  }, [discardChanges, isCustomMarketingLayout, setRecordDrawerMode, onRecordDrawerModeChange])

  const handleCustomEdit = useCallback(() => {
    setRecordDrawerMode("edit")
    onRecordDrawerModeChange?.("edit")
  }, [setRecordDrawerMode, onRecordDrawerModeChange])

  const handleSave = useCallback(async () => {
    try {
      await save()
      if (
        (recordLayoutType === "event" || recordLayoutType === "social_post") &&
        recordDrawerMode === "edit"
      ) {
        setRecordDrawerMode("view")
        onRecordDrawerModeChange?.("view")
      }
    } catch (e: any) {
      if (!isAbortError(e)) {
        const message = e?.message || "Unknown error"
        const code = e?.code ? ` (code: ${e.code})` : ""
        toast({
          variant: "destructive",
          title: "Failed to save record",
          description: `${message}${code}`,
        })
      }
    }
  }, [
    save,
    toast,
    recordLayoutType,
    recordDrawerMode,
    setRecordDrawerMode,
    onRecordDrawerModeChange,
  ])

  const handleDuplicate = useCallback(async () => {
    if (!recordId || !effectiveTableName || !formData || Object.keys(formData).length === 0) return
    try {
      const supabase = createClient()
      const { id, created_at, updated_at, ...recordData } = formData
      const { data, error } = await supabase
        .from(effectiveTableName)
        .insert([recordData])
        .select()
        .single()
      if (error) throw error
      toast({ title: "Record duplicated", description: "A copy has been created.", variant: "success" })
      onRecordDuplicate?.(data?.id)
    } catch (e: any) {
      if (!isAbortError(e)) {
        toast({ variant: "destructive", title: "Failed to duplicate", description: e?.message || "Please try again" })
      }
    }
  }, [recordId, effectiveTableName, formData, toast, onRecordDuplicate])

  const handleDelete = useCallback(async () => {
    if (!canDeleteRecords) {
      toast({
        variant: "destructive",
        title: "Not allowed",
        description: "You don't have permission to delete this record.",
      })
      return
    }
    try {
      await deleteRecord({
        confirmMessage: "Are you sure you want to delete this record? This action cannot be undone.",
      })
    } catch (e: any) {
      if (!isAbortError(e)) {
        toast({
          variant: "destructive",
          title: "Failed to delete record",
          description: e?.message || "Please try again",
        })
      }
    }
  }, [deleteRecord, canDeleteRecords, toast])

  if (mode === "inline") {
    return null
  }

  const renderFieldsContent = () => {
    // Event calendar passes rich payload from the block; render it without waiting on
    // a separate single-row fetch (which can fail on soft-delete column races).
    if (showEventContextualView && eventContextual) {
      return (
        <EventRecordContextualView
          payload={eventContextual}
          onClose={() => onClose?.()}
          onEdit={handleCustomEdit}
          onDelete={recordId && onDeleted ? handleDelete : undefined}
          canDelete={canDeleteRecords}
          deleting={deleting}
        />
      )
    }

    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-500">Loading...</div>
        </div>
      )
    }
    if (recordId && (!formData || Object.keys(formData).length === 0) && !hasDraftToRestore) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-500">Record not found</div>
        </div>
      )
    }
    if (filteredFields.length === 0 || !contentReady) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-500">Preparing fields…</div>
        </div>
      )
    }

    if (useCustomLayout) {
      const statusValue =
        customLayout.statusField && formData
          ? formData[customLayout.statusField.name]
          : null
      const titleValue =
        customLayout.titleField && formData
          ? formData[customLayout.titleField.name]
          : recordTitle
      const previewCandidate = Array.isArray(mediaPreviewValue)
        ? mediaPreviewValue[0]
        : mediaPreviewValue
      const previewUrl =
        typeof previewCandidate === "string"
          ? previewCandidate
          : previewCandidate && typeof previewCandidate === "object" && typeof (previewCandidate as any).url === "string"
            ? (previewCandidate as any).url
            : null
      const isAssetLayout = recordLayoutType === "asset"
      const firstAssetUrl =
        previewUrl ||
        customLayout.sections
          .flatMap((section) => section.fields)
          .map((field) => extractUrlLike(formData[field.name]))
          .find((url): url is string => Boolean(url)) ||
        null

      const handleAssetDownload = () => {
        if (!firstAssetUrl) return
        window.open(firstAssetUrl, "_blank", "noopener,noreferrer")
      }

      const handleAssetViewFull = () => {
        if (!firstAssetUrl) return
        window.open(firstAssetUrl, "_blank", "noopener,noreferrer")
      }

      const handleAssetCopyLink = async () => {
        if (!firstAssetUrl) return
        try {
          await navigator.clipboard.writeText(firstAssetUrl)
          toast({ title: "Link copied", variant: "success" })
        } catch {
          toast({
            title: "Could not copy link",
            description: "Copy failed. Please copy from the address bar.",
            variant: "destructive",
          })
        }
      }

      const renderCustomSectionFields = (sectionId: string) => {
        const section = customLayout.sections.find((item) => item.id === sectionId)
        if (!section) return null
        return (
          <div className="px-1 py-2 space-y-3">
            {section.fields.map((field) => {
              const fieldReadOnly = customLayoutReadOnly || !isFieldEditable(field.name)
              return (
                <InlineFieldEditor
                  key={field.id}
                  field={field}
                  value={formData[field.name]}
                  onChange={(v) => handleFieldChange(field.name, v)}
                  onBlur={(v) => handleFieldBlur(field.name, v)}
                  isEditing={!fieldReadOnly}
                  onEditStart={() => {}}
                  onEditEnd={() => {}}
                  onLinkedRecordClick={handleLinkedRecordClick}
                  onAddLinkedRecord={() => {}}
                  isReadOnly={fieldReadOnly}
                  tableId={tableId}
                  recordId={recordId || undefined}
                  attachmentStorageId={!recordId ? attachmentStorageId : undefined}
                  tableName={effectiveTableName || undefined}
                  displayMode="list"
                  onFieldOptionsUpdate={refreshFields}
                />
              )
            })}
          </div>
        )
      }

      const tabSections = customLayout.sections.filter((section) => section.id !== "more_fields")
      const moreFieldsSection = customLayout.sections.find((section) => section.id === "more_fields")
      const defaultTabsForUi =
        moreFieldsSection != null
          ? [...tabSections, moreFieldsSection]
          : tabSections
      const taskSectionMap = new Map(defaultTabsForUi.map((section) => [section.id, section]))
      const taskTabsForUi = [
        {
          id: "task",
          label: "Task",
          sectionIds: ["task_summary", "checklist", "notes", "more_fields"].filter((id) =>
            taskSectionMap.has(id)
          ),
          isActivity: false,
        },
        {
          id: "ownership",
          label: "Ownership",
          sectionIds: ["ownership_dates"].filter((id) => taskSectionMap.has(id)),
          isActivity: false,
        },
        {
          id: "linked",
          label: "Linked",
          sectionIds: ["linked_records"].filter((id) => taskSectionMap.has(id)),
          isActivity: false,
        },
        {
          id: "activity",
          label: "Activity",
          sectionIds: [] as string[],
          isActivity: true,
        },
      ].filter((tab) => tab.isActivity || tab.sectionIds.length > 0)

      const tabsForUi =
        isAssetLayout
          ? [
              {
                id: "details",
                label: "Details",
                sectionIds: defaultTabsForUi
                  .map((section) => section.id)
                  .filter((id) => !["usage"].includes(id)),
                isActivity: false,
              },
              {
                id: "usage",
                label: "Usage",
                sectionIds: defaultTabsForUi
                  .map((section) => section.id)
                  .filter((id) => id === "usage"),
                isActivity: false,
              },
              {
                id: "activity",
                label: "Activity",
                sectionIds: [] as string[],
                isActivity: true,
              },
            ].filter((tab) => tab.isActivity || tab.sectionIds.length > 0)
          : showTaskActivityTab
          ? taskTabsForUi
          : defaultTabsForUi.map((section) => ({
              id: section.id,
              label: section.label,
              sectionIds: [section.id],
              isActivity: false,
            }))

      return (
        <div className="flex flex-col min-h-0">
          <div className="px-4 py-3 space-y-3">
            <div className="rounded-card-lg border border-border/45 bg-background px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold truncate">
                    {String(titleValue || recordTitle || "Record Details")}
                  </h3>
                  {statusValue != null && statusValue !== "" ? (
                    <ChoicePill
                      label={String(statusValue)}
                      fieldType="single_select"
                      fieldOptions={customLayout.statusField?.options}
                      truncate
                      className="mt-1 max-w-full"
                    />
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  {firstAssetUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleAssetCopyLink}
                      aria-label="Copy link"
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {recordId && onDeleted ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={handleDelete}
                      disabled={deleting || saving || loading || !canDeleteRecords}
                      aria-label="Delete asset"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
              {hasDraftToRestore ? (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <span>You have an unsaved draft.</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={restoreDraft}>
                      Restore
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearDraft}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            {(activeCustomTab === "overview" || activeCustomTab === "media") && previewUrl ? (
              <div className="rounded-card-lg border border-border/35 bg-card p-3">
                <p className="text-xs text-muted-foreground mb-2">Preview</p>
                <img
                  src={previewUrl}
                  alt="Media preview"
                  className="w-full max-h-56 object-cover rounded-md border border-border/30"
                />
              </div>
            ) : null}

            <Tabs value={activeCustomTab} onValueChange={setActiveCustomTab} className="w-full">
              <TabsList className="h-9 w-full justify-start flex-wrap gap-0.5 bg-muted/30 p-1">
                {tabsForUi.map((section) => (
                  <TabsTrigger
                    key={section.id}
                    value={section.id}
                    className="text-xs px-2.5 py-1 h-7 data-[state=active]:bg-background"
                  >
                    {section.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {tabsForUi.map((tab) => (
                <TabsContent
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    "mt-3 focus-visible:outline-none",
                    mode === "review" && (recordId || canSave) ? "pb-28" : undefined
                  )}
                >
                  {tab.isActivity ? (
                    <div className="space-y-4 px-1 py-2">
                      <div className="rounded-card-lg border border-border/35 bg-card p-3">
                        <RecordActivity record={formData} tableId={tableId} />
                      </div>
                      {recordId ? (
                        <div className="rounded-card-lg border border-border/35 bg-card p-3">
                          <RecordComments
                            tableId={tableId}
                            recordId={recordId}
                            canAddComment={canComment}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tab.sectionIds.map((sectionId) => (
                        <div key={sectionId}>{renderCustomSectionFields(sectionId)}</div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </div>

          {mode === "review" && !recordId && canSave && !customLayoutReadOnly ? (
            <div className="sticky bottom-0 z-10 border-t border-border/40 bg-background/95 backdrop-blur px-4 py-3 flex flex-col gap-2 shrink-0">
              <Button
                type="button"
                size="sm"
                className="w-full"
                onClick={handleSave}
                disabled={saving || loading || !canSave}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : null}

          {mode === "review" && recordId ? (
            <div className="sticky bottom-0 z-10 border-t border-border/40 bg-background/95 backdrop-blur px-4 py-3 flex flex-col gap-2 shrink-0">
              {isAssetLayout && firstAssetUrl ? (
                <>
                  <Button type="button" size="sm" className="w-full" onClick={handleAssetDownload}>
                    Download
                  </Button>
                  <div className="grid grid-cols-3 gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleAssetViewFull}>
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Full size
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={handleAssetCopyLink}>
                      <Link2 className="h-4 w-4 mr-1" />
                      Copy link
                    </Button>
                    {customLayoutReadOnly && canEditRecords ? (
                      <Button type="button" variant="outline" size="sm" onClick={handleCustomEdit}>
                        Edit
                      </Button>
                    ) : (
                      <div />
                    )}
                  </div>
                </>
              ) : null}
              {customLayoutReadOnly && canEditRecords && !(isAssetLayout && firstAssetUrl) ? (
                <Button type="button" size="sm" className="w-full" onClick={handleCustomEdit}>
                  {customEditLabel}
                </Button>
              ) : null}
              {!customLayoutReadOnly && canEditRecords ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={handleCustomDiscard}
                    disabled={saving || loading}
                  >
                    Discard changes
                  </Button>
                  {(!saveOnFieldChange || isDirty) && (
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1"
                      onClick={handleSave}
                      disabled={saving || loading || !canSave}
                    >
                      {saving ? "Saving…" : "Save changes"}
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )
    }

    if (mode === "review" || (mode === "modal" && isEditingLayout)) {
      const hasVisibleFields = (isEditingLayout ? layoutModeFields : visibleFields).length > 0
      if (!hasVisibleFields && !isEditingLayout) {
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
            <p className="text-sm font-medium">No fields in layout</p>
            <p className="text-xs mt-1">
              {canEditLayout
                ? "Use the right panel to add and arrange fields."
                : "Ask an admin to configure the detail panel layout in Settings."}
            </p>
          </div>
        )
      }
      // Record view (canvas): stacked layout only - fields resizable by drag/reorder, no fixed columns.
      // Modal: allow grid layout when field_layout has column metadata for drag/resize between columns.
      const hasColumnMetadata = resolvedFieldLayout.some(
        (i) => i.modal_column_id != null || i.modal_column_span != null || i.modal_row_order != null
      )
      const useGridLayout =
        visibilityContext !== "canvas" &&
        resolvedFieldLayout.length > 0 &&
        (hasColumnMetadata || isEditingLayout)
      return (
        <div className="px-4 py-3 space-y-3">
          <div className="rounded-card-lg border border-border/35 bg-card overflow-hidden divide-y divide-border/25">
          <RecordFields
            fields={isEditingLayout ? layoutModeFields : visibleFields}
            formData={formData}
            onFieldChange={handleFieldChange}
            onFieldBlur={handleFieldBlur}
            fieldGroups={fieldGroups}
            tableId={tableId}
            recordId={recordId || ""}
            attachmentStorageId={!recordId ? attachmentStorageId : undefined}
            tableName={effectiveTableName || ""}
            isFieldEditable={isFieldEditable}
            fieldLayout={localFieldLayout.length > 0 ? localFieldLayout : resolvedFieldLayout}
            allFields={filteredFields}
            pageEditable={effectiveEditable}
            onFieldLabelClick={handleFieldLabelClick}
            layoutMode={isEditingLayout}
            onFieldLayoutChange={isEditingLayout ? handleFieldLayoutChange : undefined}
            onFieldSelect={isEditingLayout ? handleFieldSelect : undefined}
            onFieldSpanToggle={isEditingLayout ? handleFieldSpanToggle : undefined}
            visibilityContext={visibilityContext}
            selectedFieldId={selectedContext?.type === "field" ? selectedContext.fieldId : null}
            forceStackedLayout={!useGridLayout}
            onFieldOptionsUpdate={refreshFields}
          />
          </div>
        </div>
      )
    }

    if (!forceFlatLayout && resolvedFieldLayout.length > 0 && recordId) {
      return (
        <div className="space-y-4 py-4">
          <RecordFields
            fields={visibleFields}
            formData={formData}
            onFieldChange={handleFieldChange}
            onFieldBlur={handleFieldBlur}
            fieldGroups={fieldGroups}
            tableId={tableId}
            recordId={recordId}
            tableName={effectiveTableName || ""}
            isFieldEditable={isFieldEditable}
            fieldLayout={resolvedFieldLayout}
            allFields={filteredFields}
            pageEditable={effectiveEditable}
            onFieldOptionsUpdate={refreshFields}
            onFieldLabelClick={handleFieldLabelClick}
            layoutMode={false}
            visibilityContext={visibilityContext}
            selectedFieldId={selectedContext?.type === "field" ? selectedContext.fieldId : null}
            forceStackedLayout={true}
          />
        </div>
      )
    }

    if (!forceFlatLayout && showFieldSections && sectionedFields) {
      return (
        <div className="space-y-4 py-4">
          {sectionedFields.map(([sectionName, sectionFields]) => {
            const isCollapsed = collapsedSections.has(sectionName)
            return (
              <div key={sectionName} className="space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedSections((prev) => {
                      const next = new Set(prev)
                      if (next.has(sectionName)) next.delete(sectionName)
                      else next.add(sectionName)
                      return next
                    })
                  }
                  className="w-full flex items-center justify-between text-left py-1 -mx-1 px-1 rounded-md hover:bg-gray-50"
                >
                  <span className="text-sm font-semibold text-gray-900">{sectionName}</span>
                  {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {!isCollapsed &&
                  sectionFields.map((field) => (
                    <FieldEditor
                      key={field.id}
                      field={field}
                      value={formData[field.name]}
                      onChange={(v) => handleFieldChange(field.name, v)}
                      onBlur={(v) => handleFieldBlur(field.name, v)}
                      required={field.required || false}
                      recordId={recordId || undefined}
                      attachmentStorageId={!recordId ? attachmentStorageId : undefined}
                      tableName={effectiveTableName || undefined}
                      isReadOnly={!effectiveEditable}
                    />
                  ))}
              </div>
            )
          })}
        </div>
      )
    }

    return (
        <div className="space-y-4 py-4">
          {filteredFields.map((field) => (
            <FieldEditor
              key={field.id}
              field={field}
              value={formData[field.name]}
              onChange={(v) => handleFieldChange(field.name, v)}
              onBlur={(v) => handleFieldBlur(field.name, v)}
              required={field.required || false}
              recordId={recordId || undefined}
              attachmentStorageId={!recordId ? attachmentStorageId : undefined}
              tableName={effectiveTableName || undefined}
              isReadOnly={!effectiveEditable}
            />
          ))}
        </div>
    )
  }

  const showHeader = mode === "modal" && renderHeaderActions
  const showReviewHeader = mode === "review" && !showEventContextualView

  return (
    <div className="flex flex-col min-h-full w-full">
      {showHeader && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-white">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 flex-shrink-0" aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="min-w-0 flex-1 truncate text-lg font-semibold">
              {recordId ? (recordTitle || "Record Details") : "Create New Record"}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {recordId && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting || saving || loading || !canDeleteRecords}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            )}
            {onClose && (
              <Button variant="outline" onClick={onClose} disabled={deleting || saving}>
                {saveOnFieldChange && recordId ? "Close" : "Cancel"}
              </Button>
            )}
            {(!saveOnFieldChange || !recordId) && (
              <Button onClick={handleSave} disabled={saving || loading || !canSave}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </Button>
            )}
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {showReviewHeader && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-gray-50">
          <div className="min-w-0 flex-1 truncate font-medium">
            {recordTitle || "Record Details"}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {recordId && onDeleted && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={deleting || saving || loading || !canDeleteRecords}
                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                title={!canDeleteRecords ? "You don't have permission to delete" : "Delete record"}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
            {interfaceMode === "edit" && canSave && (!saveOnFieldChange || !recordId) && (
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                disabled={saving || loading}
                className="gap-1.5"
              >
                <Save className="h-4 w-4" />
                Save
              </Button>
            )}
            {onRecordDuplicate && recordId && canEditRecords && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDuplicate}
                className="gap-1.5"
                title="Duplicate record"
              >
                <Copy className="h-4 w-4" />
                Duplicate
              </Button>
            )}
            {onOpenModal && (
              <Button variant="outline" size="sm" onClick={onOpenModal} className="gap-1.5">
                <Maximize2 className="h-4 w-4" />
                Open in modal
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Content stacks naturally so section headers + fields push comments down; parent scrolls */}
      <div className="flex-shrink-0 flex flex-col overflow-visible pl-6 pr-0">
        {hasDraftToRestore && !useCustomLayout && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span>You have an unsaved draft. Restore it?</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={restoreDraft}>
                Restore draft
              </Button>
              <Button variant="ghost" size="sm" onClick={clearDraft}>
                Discard
              </Button>
            </div>
          </div>
        )}
        {renderFieldsContent()}
      </div>

      {mode === "modal" && showComments && recordId && !loading && formData && Object.keys(formData).length > 0 && (
        <div className="border-t border-dashed border-gray-200 pl-6 pr-0 py-4 flex-shrink-0">
          <RecordComments tableId={tableId} recordId={recordId} canAddComment={canComment} />
        </div>
      )}

      {mode === "review" && recordId && !showEventContextualView && !showTaskActivityTab && (
        <>
          {renderExtraContent && (
            <div className="border-t flex-shrink-0 overflow-visible">
              {renderExtraContent}
            </div>
          )}
          <div className="border-t border-dashed border-gray-200 pl-6 pr-0 py-4 flex-shrink-0">
            <RecordActivity record={formData} tableId={tableId} />
          </div>
          <div className="border-t border-dashed border-gray-200 pl-6 pr-0 py-4 flex-shrink-0">
            <RecordComments tableId={tableId} recordId={recordId} canAddComment={canComment} />
          </div>
        </>
      )}

      {mode === "review" && recordId && showEventContextualView && (
        <div className="border-t border-dashed border-gray-200 pl-6 pr-0 py-4 flex-shrink-0">
          <RecordComments tableId={tableId} recordId={recordId} canAddComment={canComment} />
        </div>
      )}

    </div>
  )
}
