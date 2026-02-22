'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  CheckCircle2,
  Copy,
  FileText,
  FolderOpen,
  PencilLine,
  Plus,
  Save,
  Search,
  X,
} from 'lucide-react';
import { functions } from '../../lib/firebase';

interface PromptVersion {
  id: string;
  version: number;
  content: string;
  isActive: boolean;
  createdAt: string | null;
}

interface PromptType {
  id: string;
  title: string;
  description: string;
  versions: PromptVersion[];
}

interface EditorTarget {
  promptTypeId: string;
  promptTypeTitle: string;
  promptVersionId: string;
  promptVersionNumber: number;
  originalContent: string;
}

const updatePrompt = httpsCallable(functions, 'updatePromptVersion');
const createPromptVersion = httpsCallable(functions, 'createPromptVersion');
const setActivePromptVersion = httpsCallable(functions, 'setActivePromptVersion');
const getPromptDashboardData = httpsCallable(functions, 'getPromptDashboardData');

function getCallableErrorMessage(err: unknown, fallback: string) {
  if (!err || typeof err !== 'object') return fallback;
  const e = err as { code?: string; message?: string };
  if (e.code === 'functions/not-found') {
    return '신규 함수(createPromptVersion)가 배포되지 않았습니다. functions 재배포가 필요합니다.';
  }
  return e.message || fallback;
}

export function PromptManager({ promptTypes: initialPromptTypes }: { promptTypes: PromptType[] }) {
  const [promptTypes, setPromptTypes] = useState<PromptType[]>(initialPromptTypes);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(initialPromptTypes[0]?.id ?? null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    initialPromptTypes[0]?.versions[0]?.id ?? null,
  );
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  const [isSettingActive, setIsSettingActive] = useState(false);
  const [isSavingModal, setIsSavingModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [versionSearchQuery, setVersionSearchQuery] = useState('');
  const [versionSort, setVersionSort] = useState<'active' | 'latest' | 'oldest'>('active');
  const [copied, setCopied] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [modalContent, setModalContent] = useState('');
  const editorDialogRef = useRef<HTMLDialogElement | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    setPromptTypes(initialPromptTypes);
    if (!selectedTypeId && initialPromptTypes[0]) {
      setSelectedTypeId(initialPromptTypes[0].id);
      setSelectedVersionId(initialPromptTypes[0].versions[0]?.id ?? null);
    }
  }, [initialPromptTypes]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    const dialog = editorDialogRef.current;
    if (!dialog) return;

    if (isEditorOpen) {
      if (!dialog.open) {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute('open', 'true');
        }
      }
      return;
    }

    if (dialog.open) {
      dialog.close();
    }
  }, [isEditorOpen]);

  const syncPromptTypesFromServer = async () => {
    try {
      const result = await getPromptDashboardData({});
      const data = result.data as { promptTypes?: PromptType[] };
      if (!Array.isArray(data.promptTypes)) return;
      setPromptTypes(data.promptTypes);
    } catch (err) {
      console.error('Error syncing prompts from server:', err);
    }
  };

  useEffect(() => {
    void syncPromptTypesFromServer();
  }, []);

  const filteredPromptTypes = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    if (!q) return promptTypes;

    return promptTypes.filter((type) => {
      if (
        type.title.toLowerCase().includes(q) ||
        type.description.toLowerCase().includes(q) ||
        type.id.toLowerCase().includes(q)
      ) {
        return true;
      }
      return type.versions.some((version) => version.content.toLowerCase().includes(q));
    });
  }, [deferredSearchQuery, promptTypes]);

  const selectedType = useMemo(
    () => promptTypes.find((type) => type.id === selectedTypeId) ?? null,
    [promptTypes, selectedTypeId],
  );

  const selectedVersion = useMemo(
    () => selectedType?.versions.find((version) => version.id === selectedVersionId) ?? selectedType?.versions[0] ?? null,
    [selectedType, selectedVersionId],
  );

  const filteredVersions = useMemo(() => {
    if (!selectedType) return [];
    const q = versionSearchQuery.trim().toLowerCase();
    const searched = !q
      ? selectedType.versions
      : selectedType.versions.filter((version) => {
      return (
        String(version.version).includes(q) ||
        version.content.toLowerCase().includes(q) ||
        (version.isActive && 'active'.includes(q))
      );
    });

    const sorted = [...searched];
    sorted.sort((a, b) => {
      if (versionSort === 'active') {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return b.version - a.version;
      }
      if (versionSort === 'latest') return b.version - a.version;
      return a.version - b.version;
    });
    return sorted;
  }, [selectedType, versionSearchQuery, versionSort]);

  const isModalDirty =
    isEditorOpen && editorTarget ? modalContent !== editorTarget.originalContent : false;
  const editorTitleUpper = editorTarget?.promptTypeTitle.toUpperCase() ?? '';
  const isSchemaEditor = editorTitleUpper.includes('SCHEMA');
  const isSystemPromptEditor = editorTitleUpper.includes('SYSTEM_PROMPT');

  const jsonValidation = useMemo(() => {
    if (!isSchemaEditor) return null;
    const raw = modalContent.trim();
    if (!raw) {
      return { valid: false, message: '빈 JSON', pretty: null as string | null };
    }
    try {
      const parsed = JSON.parse(raw);
      return {
        valid: true,
        message: '유효한 JSON',
        pretty: JSON.stringify(parsed, null, 2),
      };
    } catch (err) {
      return {
        valid: false,
        message: err instanceof Error ? err.message : 'JSON 파싱 실패',
        pretty: null,
      };
    }
  }, [isSchemaEditor, modalContent]);

  useEffect(() => {
    if (!selectedType && filteredPromptTypes.length > 0) {
      setSelectedTypeId(filteredPromptTypes[0].id);
      setSelectedVersionId(filteredPromptTypes[0].versions[0]?.id ?? null);
    }
  }, [filteredPromptTypes, selectedType]);

  useEffect(() => {
    if (!selectedType) return;
    if (!selectedType.versions.length) {
      setSelectedVersionId(null);
      return;
    }
    if (!selectedType.versions.some((version) => version.id === selectedVersionId)) {
      setSelectedVersionId(selectedType.versions[0].id);
    }
  }, [selectedType, selectedVersionId]);

  const confirmDiscardEditorChanges = () => {
    if (!isModalDirty) return true;
    return window.confirm('저장되지 않은 변경사항이 있습니다. 버리고 이동할까요?');
  };

  const openEditor = () => {
    if (!selectedType || !selectedVersion) return;
    openEditorForVersion(selectedVersion, selectedType);
  };

  const openEditorForVersion = (version: PromptVersion, typeOverride?: PromptType) => {
    if (!confirmDiscardEditorChanges()) return;
    const targetType = typeOverride ?? selectedType;
    if (!targetType) return;
    setSelectedVersionId(version.id);
    setEditorTarget({
      promptTypeId: targetType.id,
      promptTypeTitle: targetType.title,
      promptVersionId: version.id,
      promptVersionNumber: version.version,
      originalContent: version.content,
    });
    setModalContent(version.content);
    setError(null);
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    if (!confirmDiscardEditorChanges()) return;
    setIsEditorOpen(false);
    setEditorTarget(null);
    setError(null);
  };

  const handleSelectType = (type: PromptType) => {
    if (!confirmDiscardEditorChanges()) return;
    setSelectedTypeId(type.id);
    setSelectedVersionId(type.versions[0]?.id ?? null);
    setVersionSearchQuery('');
    setVersionSort('active');
    setIsEditorOpen(false);
    setEditorTarget(null);
    setError(null);
  };

  const handleSelectVersion = (versionId: string) => {
    if (!confirmDiscardEditorChanges()) return;
    setSelectedVersionId(versionId);
    setIsEditorOpen(false);
    setEditorTarget(null);
    setError(null);
  };

  const handleCopy = async () => {
    if (!selectedVersion) return;
    try {
      await navigator.clipboard.writeText(selectedVersion.content);
      setCopied(true);
    } catch (err) {
      console.error(err);
      setError('복사에 실패했습니다. 브라우저 권한을 확인해 주세요.');
    }
  };

  const handleSaveModal = async () => {
    if (!editorTarget) return;
    setIsSavingModal(true);
    setError(null);

    try {
      await updatePrompt({
        promptVersionId: editorTarget.promptVersionId,
        newContent: modalContent,
      });

      setPromptTypes((prev) =>
        prev.map((type) =>
          type.id !== editorTarget.promptTypeId
            ? type
            : {
                ...type,
                versions: type.versions.map((version) =>
                  version.id === editorTarget.promptVersionId
                    ? { ...version, content: modalContent }
                    : version,
                ),
              },
        ),
      );
      setIsEditorOpen(false);
      setEditorTarget(null);
      void syncPromptTypesFromServer();
    } catch (err) {
      console.error('Error updating prompt version:', err);
      const message = getCallableErrorMessage(
        err,
        '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      );
      setError(message);
    } finally {
      setIsSavingModal(false);
    }
  };

  const handleFormatJson = () => {
    if (!isSchemaEditor || !jsonValidation?.valid || !jsonValidation.pretty) return;
    setModalContent(jsonValidation.pretty);
  };

  const handleMinifyJson = () => {
    if (!isSchemaEditor || !jsonValidation?.valid) return;
    try {
      setModalContent(JSON.stringify(JSON.parse(modalContent)));
    } catch {
      // no-op
    }
  };

  const handleAddVersion = async (mode: 'blank' | 'copy') => {
    if (!selectedType) return;
    if (!confirmDiscardEditorChanges()) return;

    setIsCreatingVersion(true);
    setError(null);

    try {
      const result = await createPromptVersion({
        promptTypeId: selectedType.id,
        baseContent: mode === 'copy' ? (selectedVersion?.content ?? '') : '',
      });

      const data = result.data as {
        promptVersion?: PromptVersion & { promptTypeId?: string };
      };
      const created = data.promptVersion;
      if (!created) throw new Error('No created prompt version returned');

      setPromptTypes((prev) =>
        prev.map((type) => {
          if (type.id !== selectedType.id) return type;
          return {
            ...type,
            versions: [...type.versions, created].sort((a, b) => {
              if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
              return b.version - a.version;
            }),
          };
        }),
      );

      openEditorForVersion(created);
      void syncPromptTypesFromServer();
    } catch (err) {
      console.error('Error creating prompt version:', err);
      setError(getCallableErrorMessage(err, '버전 추가에 실패했습니다. 잠시 후 다시 시도해 주세요.'));
    } finally {
      setIsCreatingVersion(false);
    }
  };

  const handleSetActiveVersion = async () => {
    if (!selectedType || !selectedVersion) return;
    if (selectedVersion.isActive) return;
    if (!confirmDiscardEditorChanges()) return;

    setIsSettingActive(true);
    setError(null);

    try {
      await setActivePromptVersion({
        promptTypeId: selectedType.id,
        promptVersionId: selectedVersion.id,
      });

      setPromptTypes((prev) =>
        prev.map((type) => {
          if (type.id !== selectedType.id) return type;
          return {
            ...type,
            versions: type.versions
              .map((version) => ({ ...version, isActive: version.id === selectedVersion.id }))
              .sort((a, b) => {
                if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
                return b.version - a.version;
              }),
          };
        }),
      );
      void syncPromptTypesFromServer();
    } catch (err) {
      console.error('Error setting active version:', err);
      setError('ACTIVE 버전 지정에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSettingActive(false);
    }
  };

  return (
    <div className="h-screen bg-[#f4f7fb] text-slate-900">
      <div className="flex h-full">
        <aside className="hidden w-[248px] shrink-0 border-r border-[#e4ebf4] bg-white lg:flex lg:flex-col">
          <div className="border-b border-[#eef2f8] px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4b74d9]">MS Reunion</p>
            <h1 className="mt-2 text-lg font-semibold text-slate-900">관리자 콘솔</h1>
            <p className="mt-1 text-xs text-slate-500">Prompt Version Manager</p>
          </div>
          <div className="px-4 py-4">
            <div className="rounded-2xl border border-[#e5ecf5] bg-[#f8fbff] p-4">
              <p className="text-xs text-slate-500">현재 화면</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">프롬프트 타입 / 버전 관리</p>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-[#e4ebf4] bg-white px-4 py-3 sm:px-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                  프롬프트 버전 편집 워크스페이스
                </h2>
              </div>
              <div className="relative w-full md:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <label htmlFor="prompt-search" className="sr-only">
                  Search prompt types
                </label>
                <input
                  id="prompt-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="프롬프트 타입 검색"
                  className="h-10 w-full rounded-xl border border-[#dfe7f2] bg-[#fbfdff] pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#7da2ff] focus:ring-4 focus:ring-[#dfeaff]"
                />
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 p-4 sm:p-6">
            <div className="grid h-full min-h-0 grid-cols-1 gap-4 md:grid-cols-[340px_minmax(0,1fr)]">
              <section className="flex min-h-[320px] flex-col rounded-2xl border border-[#e5ecf5] bg-white shadow-sm">
                <div className="border-b border-[#eef2f8] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Prompt Types</h3>
                    </div>
                    <span className="rounded-full bg-[#edf3ff] px-2.5 py-1 text-xs font-medium text-[#4167c6]">
                      {filteredPromptTypes.length}
                    </span>
                  </div>
                </div>

                <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                  {filteredPromptTypes.length === 0 ? (
                    <li className="rounded-xl border border-dashed border-[#dfe7f2] bg-[#fafcff] p-4 text-sm text-slate-500">
                      검색 결과가 없습니다.
                    </li>
                  ) : (
                    filteredPromptTypes.map((type) => {
                      const isActive = selectedType?.id === type.id;
                      return (
                        <li key={type.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectType(type)}
                            className={[
                              'w-full rounded-xl border px-3 py-3 text-left transition',
                              isActive
                                ? 'border-[#cfe0ff] bg-[#f3f8ff]'
                                : 'border-transparent bg-white hover:border-[#e3eaf5] hover:bg-[#fbfdff]',
                            ].join(' ')}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={[
                                  'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                                  isActive ? 'bg-[#e4efff] text-[#3f67ca]' : 'bg-[#f3f6fa] text-slate-500',
                                ].join(' ')}
                              >
                                <FolderOpen className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-sm font-semibold text-slate-900">{type.title}</p>
                                <p className="mt-1 text-xs text-slate-500">버전 {type.versions.length}개</p>
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </section>

              <section className="flex min-h-[420px] min-w-0 flex-col rounded-2xl border border-[#e5ecf5] bg-white shadow-sm">
                {selectedType ? (
                  <>
                    <div className="border-b border-[#eef2f8] p-4 sm:p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <h3 className="mt-1 break-words text-2xl font-semibold tracking-tight text-slate-900">
                            {selectedType.title}
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            버전을 더블클릭하면 팝업에서 수정/저장할 수 있습니다.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleAddVersion('blank')}
                            disabled={isCreatingVersion}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d8e4ff] bg-[#eef4ff] px-3.5 text-sm font-semibold text-[#3f67ca] transition hover:bg-[#e4eeff] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Plus className="h-4 w-4" />
                            {isCreatingVersion ? '추가 중...' : '빈 버전 추가'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddVersion('copy')}
                            disabled={isCreatingVersion || !selectedVersion}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dde6f2] bg-white px-3.5 text-sm font-medium text-slate-700 transition hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Copy className="h-4 w-4" />
                            현재 버전 복사 추가
                          </button>
                          <button
                            type="button"
                            onClick={handleCopy}
                            disabled={!selectedVersion}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dde6f2] bg-white px-3.5 text-sm font-medium text-slate-700 transition hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Copy className="h-4 w-4" />
                            {copied ? 'Copied' : '복사'}
                          </button>
                          <button
                            type="button"
                            onClick={() => selectedVersion && openEditorForVersion(selectedVersion)}
                            disabled={!selectedVersion}
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#4b74d9] px-3.5 text-sm font-semibold text-white transition hover:bg-[#3f67ca] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <PencilLine className="h-4 w-4" />
                            편집 팝업 열기
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="border-b border-[#eef2f8] p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-slate-900">Prompt Versions</h4>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={versionSort}
                            onChange={(e) => setVersionSort(e.target.value as 'active' | 'latest' | 'oldest')}
                            className="h-9 rounded-lg border border-[#dfe7f2] bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-[#7da2ff]"
                            aria-label="버전 정렬"
                          >
                            <option value="active">ACTIVE 우선</option>
                            <option value="latest">최신 버전 우선</option>
                            <option value="oldest">버전 번호 오름차순</option>
                          </select>
                          <button
                            type="button"
                            onClick={handleSetActiveVersion}
                            disabled={!selectedVersion || selectedVersion.isActive || isSettingActive}
                            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dce8da] bg-[#eef8ef] px-3 text-xs font-semibold text-[#287a38] transition hover:bg-[#e6f4e8] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {isSettingActive
                              ? '설정 중...'
                              : selectedVersion?.isActive
                                ? 'ACTIVE 버전'
                                : '선택 버전을 ACTIVE로 지정'}
                          </button>
                        </div>
                      </div>

                      <div className="mb-3">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <label htmlFor="version-search" className="sr-only">
                            Search prompt versions
                          </label>
                          <input
                            id="version-search"
                            type="search"
                            value={versionSearchQuery}
                            onChange={(e) => setVersionSearchQuery(e.target.value)}
                            placeholder="버전 내용 검색"
                            className="h-9 w-full rounded-lg border border-[#dfe7f2] bg-[#fbfdff] pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#7da2ff] focus:ring-4 focus:ring-[#dfeaff]"
                          />
                        </div>
                      </div>

                      {selectedType.versions.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#dfe7f2] bg-[#fafcff] p-4 text-sm text-slate-500">
                          이 타입에는 버전이 없습니다.
                        </div>
                      ) : filteredVersions.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#dfe7f2] bg-[#fafcff] p-4 text-sm text-slate-500">
                          버전 검색 결과가 없습니다.
                        </div>
                      ) : (
                        <ul className="space-y-2">
                          {filteredVersions.map((version) => {
                            const isSelected = selectedVersion?.id === version.id;
                            const preview = version.content.replace(/\s+/g, ' ').trim() || '(빈 내용)';
                            return (
                              <li key={version.id}>
                                <div
                                  onDoubleClick={() => openEditorForVersion(version)}
                                  className={[
                                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 transition',
                                    isSelected
                                      ? 'border-[#cfe0ff] bg-[#f3f8ff]'
                                      : 'border-[#e8eef7] bg-white hover:bg-[#fbfdff]',
                                  ].join(' ')}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleSelectVersion(version.id)}
                                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                  >
                                  <div
                                    className={[
                                      'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                                      isSelected ? 'bg-[#e4efff] text-[#3f67ca]' : 'bg-[#f3f6fa] text-slate-500',
                                    ].join(' ')}
                                  >
                                    <FileText className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold text-slate-900">v{version.version}</span>
                                      {version.isActive && (
                                        <span className="rounded-full bg-[#e6f4ea] px-2 py-0.5 text-[11px] font-semibold text-[#1f7a39]">
                                          ACTIVE
                                        </span>
                                      )}
                                    </div>
                                    <p className="truncate text-xs text-slate-500">{preview}</p>
                                  </div>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditorForVersion(version);
                                    }}
                                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#dde6f2] bg-white text-slate-500 transition hover:bg-[#f3f8ff] hover:text-[#3f67ca]"
                                    aria-label={`버전 v${version.version} 편집`}
                                    title="편집 팝업 열기"
                                  >
                                    <PencilLine className="h-4 w-4" />
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    {error && (
                      <div className="mx-4 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:mx-5">
                        {error}
                      </div>
                    )}

                    <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-500">
                      버전을 선택하고 더블클릭하면 편집 팝업이 열립니다.
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center p-8">
                    <div className="rounded-2xl border border-[#e5ecf5] bg-[#fbfdff] px-8 py-10 text-center">
                      <p className="text-sm font-medium text-slate-700">Prompt Type을 선택하세요</p>
                      <p className="mt-2 text-sm text-slate-500">
                        좌측 목록에서 타입을 선택하면 우측에 버전 리스트가 표시됩니다.
                      </p>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </main>
        </div>
      </div>

      <dialog
        ref={editorDialogRef}
        onCancel={(e) => {
          e.preventDefault();
          closeEditor();
        }}
        className="backdrop:bg-slate-900/50 rounded-2xl p-0 border-0 bg-transparent"
      >
        {isEditorOpen && editorTarget ? (
          <div className="flex h-[88vh] w-[min(1280px,94vw)] max-w-6xl flex-col rounded-2xl border border-[#e5ecf5] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#eef2f8] px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">Prompt Version Editor</p>
                <h3 className="truncate text-lg font-semibold text-slate-900">
                  {editorTarget.promptTypeTitle} · v{editorTarget.promptVersionNumber}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  {isSchemaEditor && (
                    <span
                      className={[
                        'rounded-full px-2 py-0.5 font-semibold',
                        jsonValidation?.valid
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700',
                      ].join(' ')}
                    >
                      {jsonValidation?.message ?? 'JSON'}
                    </span>
                  )}
                  {isSystemPromptEditor && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">
                      Long Text Mode
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dde6f2] bg-white px-3 text-sm font-medium text-slate-700 hover:bg-[#f8fbff]"
                >
                  <X className="h-4 w-4" />
                  닫기
                </button>
                <button
                  type="button"
                  onClick={handleSaveModal}
                  disabled={isSavingModal || !isModalDirty}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#4b74d9] px-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {isSavingModal ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
            <div className="border-b border-[#eef2f8] px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {isSchemaEditor && (
                  <>
                    <button
                      type="button"
                      onClick={handleFormatJson}
                      disabled={!jsonValidation?.valid}
                      className="inline-flex h-8 items-center rounded-lg border border-[#dde6f2] bg-white px-3 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      JSON 정렬
                    </button>
                    <button
                      type="button"
                      onClick={handleMinifyJson}
                      disabled={!jsonValidation?.valid}
                      className="inline-flex h-8 items-center rounded-lg border border-[#dde6f2] bg-white px-3 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      JSON 압축
                    </button>
                  </>
                )}
                <span className="text-xs text-slate-500">
                  {modalContent.length.toLocaleString()} chars
                </span>
                <span className="text-xs text-slate-400">
                  {modalContent.split('\n').length.toLocaleString()} lines
                </span>
              </div>
            </div>
            <div
              className={[
                'min-h-0 flex-1 p-4',
                isSystemPromptEditor ? 'grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]' : '',
              ].join(' ')}
            >
              <textarea
                value={modalContent}
                onChange={(e) => setModalContent(e.target.value)}
                spellCheck={!isSchemaEditor}
                className={[
                  'h-full w-full resize-none rounded-xl border border-[#e5ecf5] bg-[#fbfdff] p-4 text-slate-800 outline-none focus:border-[#7da2ff] focus:ring-4 focus:ring-[#dfeaff]',
                  isSystemPromptEditor
                    ? 'font-sans text-[14px] leading-7 tracking-[0.01em]'
                    : 'font-mono text-[13px] leading-6',
                ].join(' ')}
                placeholder="프롬프트 내용을 입력하세요."
              />
              {isSystemPromptEditor && (
                <div className="min-h-0 rounded-xl border border-[#e5ecf5] bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Read Preview
                  </p>
                  <div className="mt-3 h-[calc(100%-1.5rem)] overflow-y-auto rounded-lg bg-[#f8fafd] p-4">
                    <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                      {modalContent.trim() || '내용이 비어 있습니다.'}
                    </div>
                  </div>
                </div>
              )}
              {isSchemaEditor && jsonValidation && !jsonValidation.valid && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 xl:col-span-1">
                  JSON 오류: {jsonValidation.message}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div />
        )}
      </dialog>
    </div>
  );
}
