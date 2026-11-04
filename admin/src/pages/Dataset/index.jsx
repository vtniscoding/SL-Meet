import React from 'react';
import {
  SearchIcon,
  CloseIcon,
  RefreshIcon,
  EditActionIcon,
  DeleteActionIcon,
  SignGestureIcon,
  DownloadTranscriptIcon,
  UploadBackupIcon,
  PlusActionIcon,
} from '@sl-meet/shared/icons';
import { getSampleDescriptor } from '@sl-meet/shared';

/**
 * Dataset Tab: Dedicated Full-Screen Dataset & Sample Management
 * Replaces the previous slide-over drawer with a spacious, categorized grid view.
 */
export default function DatasetTab({
  gesturesList = [],
  existingLabels = [],
  filteredRosterEntries = [],
  datasetStats = { staticCount: 0, dynamicCount: 0, oneHandCount: 0, twoHandCount: 0 },
  rosterSearch = '',
  setRosterSearch,
  rosterFilter = 'all',
  setRosterFilter,
  loadAllData,
  handleRenameLabel,
  handleDeleteLabelGroup,
  handleDeleteSample,
  onSelectLabelForTraining,
  handleExportJson,
  onTriggerImportJson,
  loading = false,
  statusMsg = '',
}) {
  return (
    <div className="flex-1 w-full h-full min-h-0 flex flex-col p-4 sm:p-6 overflow-hidden bg-[#000000] text-white">
      {/* Top Header Card */}
      <div className="bg-[#202124] border border-white/5 rounded-2xl p-4 sm:p-5 mb-4 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-2xl bg-[#5CA0F2]/15 text-[#5CA0F2] flex items-center justify-center border border-[#5CA0F2]/30 shrink-0">
            <SignGestureIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-base font-bold text-white tracking-wide">
                Dataset Management
              </h1>
              <span className="text-xs bg-[#5CA0F2]/20 text-[#5CA0F2] font-semibold px-2.5 py-0.5 rounded-full border border-[#5CA0F2]/30">
                {gesturesList.length} samples
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {existingLabels.length} unique gesture classes synchronized directly with Supabase DB
            </p>
          </div>
        </div>

        {/* Action Controls: Refresh, Export, Import */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={loadAllData}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-[#3C4043] hover:bg-[#474B4F] text-slate-200 hover:text-white text-xs font-semibold transition-colors cursor-pointer border-none outline-none disabled:opacity-50"
            title="Reload dataset from Supabase"
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync DB</span>
          </button>

          {handleExportJson && (
            <button
              type="button"
              onClick={handleExportJson}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-[#3C4043] hover:bg-[#474B4F] text-slate-200 hover:text-white text-xs font-semibold transition-colors cursor-pointer border-none outline-none"
              title="Download full JSON dataset backup"
            >
              <DownloadTranscriptIcon className="w-3.5 h-3.5 text-[#5CA0F2]" />
              <span>Export Backup</span>
            </button>
          )}

          {onTriggerImportJson && (
            <button
              type="button"
              onClick={onTriggerImportJson}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-[#3C4043] hover:bg-[#474B4F] text-slate-200 hover:text-white text-xs font-semibold transition-colors cursor-pointer border-none outline-none"
              title="Import samples from backup JSON"
            >
              <UploadBackupIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span>Import Backup</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-[#202124] border border-white/5 rounded-2xl p-3 sm:p-4 mb-4 shrink-0 flex flex-col md:flex-row items-center justify-between gap-3 shadow-md">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <SearchIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={rosterSearch}
            onChange={(e) => setRosterSearch(e.target.value)}
            placeholder="Search gesture classes (e.g. Hello, Thank You, A)..."
            className="w-full bg-[#181920] border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#5CA0F2] transition-colors"
          />
          {rosterSearch && (
            <button
              type="button"
              onClick={() => setRosterSearch('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-white p-0.5 border-none bg-transparent cursor-pointer"
            >
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Modality Filter Pills */}
        <div className="flex items-center flex-wrap gap-1.5 w-full md:w-auto">
          {[
            { id: 'all', label: `All (${gesturesList.length})` },
            { id: 'static', label: `Static (${datasetStats.staticCount})` },
            { id: 'dynamic', label: `Dynamic DTW (${datasetStats.dynamicCount})` },
            { id: '1h', label: `1-Hand (${datasetStats.oneHandCount})` },
            { id: '2h', label: `2-Hand (${datasetStats.twoHandCount})` },
          ].map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setRosterFilter(pill.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer border-none outline-none ${
                rosterFilter === pill.id
                  ? 'bg-[#3C4043] text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {statusMsg && (
        <div className="text-xs text-[#8AB4F8] font-medium bg-[#202124] border border-white/5 px-4 py-2 rounded-xl mb-3 shrink-0 flex items-center justify-between">
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Main Content: Responsive Card Grid */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1 custom-scrollbar">
        {filteredRosterEntries.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-[#202124] flex items-center justify-center text-slate-500 border border-white/5">
              <SignGestureIcon className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-300">
                {gesturesList.length === 0
                  ? 'No gesture samples collected yet'
                  : 'No gesture classes match your filter'}
              </p>
              <p className="text-xs text-slate-500 max-w-sm">
                {gesturesList.length === 0
                  ? 'Switch to the "Data Labeling" tab to record your first sign gesture, or import a dataset backup directly into Supabase.'
                  : 'Try clearing the search query or selecting a different modality filter.'}
              </p>
              {gesturesList.length === 0 && onTriggerImportJson && (
                <div className="pt-3">
                  <button
                    type="button"
                    onClick={onTriggerImportJson}
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-[#5CA0F2] hover:bg-[#4A8FE0] text-slate-900 font-semibold text-xs rounded-xl shadow transition-all cursor-pointer border-none"
                  >
                    <UploadBackupIcon className="w-4 h-4 text-slate-900" />
                    <span>Import JSON to Supabase</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 pb-6">
            {filteredRosterEntries.map(({ label, samples }) => (
              <div
                key={label}
                className="bg-[#202124] border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:border-white/10 transition-all shadow-md group"
              >
                <div>
                  {/* Class Header */}
                  <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
                    <div className="flex items-center space-x-2 truncate">
                      <h3 className="text-sm font-bold text-white group-hover:text-[#5CA0F2] transition-colors truncate">
                        {label}
                      </h3>
                      <span className="text-[11px] bg-[#5CA0F2]/15 text-[#5CA0F2] px-2 py-0.5 rounded-full border border-[#5CA0F2]/30 font-semibold shrink-0">
                        {samples.length} {samples.length === 1 ? 'sample' : 'samples'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      {onSelectLabelForTraining && (
                        <button
                          type="button"
                          onClick={() => onSelectLabelForTraining(label)}
                          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                          title={`Record another sample for "${label}"`}
                        >
                          <PlusActionIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRenameLabel(label)}
                        className="p-1.5 text-slate-400 hover:text-[#5CA0F2] hover:bg-[#5CA0F2]/10 rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                        title="Rename this gesture class"
                      >
                        <EditActionIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLabelGroup(label)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                        title="Delete all samples in this class"
                      >
                        <DeleteActionIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Sample Variation List */}
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                    {samples.map((s, idx) => {
                      const desc = getSampleDescriptor(s);
                      return (
                        <div
                          key={s.id || idx}
                          className="flex items-center justify-between bg-[#181920] px-3 py-2 rounded-xl text-xs text-slate-300 border border-white/5"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <span className="text-slate-500 font-mono text-[11px] shrink-0">
                              #{idx + 1}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${desc.badgeClass}`}
                            >
                              {desc.badgeText}
                            </span>
                            <span className="text-slate-400 truncate text-[11px]">
                              {s.description || 'Captured sample'}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteSample(s.id, label)}
                            className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors shrink-0 cursor-pointer border-none bg-transparent"
                            title="Delete this sample variation"
                          >
                            <DeleteActionIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

