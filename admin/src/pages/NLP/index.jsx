import React from 'react';
import {
  ChatDrawerIcon,
  ForwardNavIcon,
  PlusActionIcon,
  RefreshIcon,
  DeleteActionIcon,
  AiTranslateIcon,
} from '@sl-meet/shared/icons';

/**
 * Isolated Tab View: NLP & Multi-Sign Phrase Grammar Engine
 * Combines 2 or 3 consecutive ASL gestures into clean contextual sentences.
 * Directly synchronizes rules with Supabase DB `asl_phrases`.
 */
export default function NlpTab({
  phraseSignCount = 2,
  setPhraseSignCount,
  firstSignChoice = '',
  setFirstSignChoice,
  secondSignChoice = '',
  setSecondSignChoice,
  thirdSignChoice = '',
  setThirdSignChoice,
  phraseTranslation = '',
  setPhraseTranslation,
  phraseDesc = '',
  setPhraseDesc,
  existingLabels = [],
  handleSavePhraseRule,
  handleDeletePhraseRule,
  phrasesList = [],
  loading = false,
  statusMsg = '',
  loadAllData,
}) {
  return (
    <div className="flex-1 w-full grid grid-cols-12 gap-6 p-6 overflow-hidden min-h-0">
      {/* Left Form: Visual NLP Rule Builder */}
      <div className="col-span-5 bg-[#202124] border border-white/5 rounded-2xl p-6 flex flex-col gap-5 overflow-y-auto">
        <div>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <AiTranslateIcon className="w-4 h-4 text-purple-400" />
              <span>Natural Language Processing (NLP) & Grammar Rules</span>
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Configure N-Gram grammar rules ({phraseSignCount} consecutive ASL signs) into complete target sentences
            (e.g.{' '}
            {phraseSignCount === 3
              ? 'Nice + Meet + You -> "Nice to meet you!"'
              : 'Good + Morning -> "Good morning!"'}
            )
          </p>
        </div>

        {/* Sequence Length Toggle: 2 Signs vs 3 Signs */}
        <div className="flex items-center justify-between bg-[#20222A] p-1.5 rounded-xl border border-slate-700/60">
          <span className="text-xs font-semibold text-slate-300 ml-2">N-Gram Sequence Length:</span>
          <div className="inline-flex space-x-1">
            <button
              type="button"
              onClick={() => setPhraseSignCount(2)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                phraseSignCount === 2
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              2 Signs (Bigram)
            </button>
            <button
              type="button"
              onClick={() => setPhraseSignCount(3)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                phraseSignCount === 3
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              3 Signs (Trigram)
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {/* Sign 1 Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              1. First Sign (Sign 1)
            </label>
            <select
              value={firstSignChoice}
              onChange={(e) => setFirstSignChoice(e.target.value)}
              className="w-full bg-[#20222A] border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              <option value="">-- Select Sign 1 (e.g. Nice, Good, Hello) --</option>
              {existingLabels.map((lbl) => (
                <option key={lbl} value={lbl}>
                  {lbl}
                </option>
              ))}
            </select>
          </div>

          {/* Sign 2 Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              2. Second Sign (Sign 2)
            </label>
            <select
              value={secondSignChoice}
              onChange={(e) => setSecondSignChoice(e.target.value)}
              className="w-full bg-[#20222A] border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              <option value="">-- Select Sign 2 (e.g. Meet, Morning, You) --</option>
              {existingLabels.map((lbl) => (
                <option key={lbl} value={lbl}>
                  {lbl}
                </option>
              ))}
            </select>
          </div>

          {/* Optional Sign 3 Selector */}
          {phraseSignCount === 3 && (
            <div className="animate-in fade-in">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                3. Third Sign (Sign 3)
              </label>
              <select
                value={thirdSignChoice}
                onChange={(e) => setThirdSignChoice(e.target.value)}
                className="w-full bg-[#20222A] border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
              >
                <option value="">-- Select Sign 3 (e.g. You, Today, All) --</option>
                {existingLabels.map((lbl) => (
                  <option key={lbl} value={lbl}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Target Translation Output */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Complete Target Translation
            </label>
            <input
              type="text"
              value={phraseTranslation}
              onChange={(e) => setPhraseTranslation(e.target.value)}
              placeholder="e.g. Nice to meet you! / Good morning!"
              className="w-full bg-[#20222A] border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Optional Grammar Note */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Contextual Notes (Optional)
            </label>
            <input
              type="text"
              value={phraseDesc}
              onChange={(e) => setPhraseDesc(e.target.value)}
              placeholder="e.g. Polite greeting when meeting someone for the first time"
              className="w-full bg-[#20222A] border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* Live Sequence Preview Card */}
        <div className="bg-[#121318] p-3.5 rounded-xl border border-slate-800/80 space-y-2 mt-auto">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            Live NLP Grammar Rule Preview
          </span>
          <div className="flex items-center space-x-2 text-xs flex-wrap gap-y-1">
            <span className="font-bold text-[#5CA0F2] bg-[#5CA0F2]/10 px-2.5 py-1 rounded-lg border border-[#5CA0F2]/30">
              {firstSignChoice || 'Sign 1'}
            </span>
            <ForwardNavIcon className="w-3.5 h-3.5 text-slate-600" />
            <span className="font-bold text-[#5CA0F2] bg-[#5CA0F2]/10 px-2.5 py-1 rounded-lg border border-[#5CA0F2]/30">
              {secondSignChoice || 'Sign 2'}
            </span>
            {phraseSignCount === 3 && (
              <>
                <ForwardNavIcon className="w-3.5 h-3.5 text-slate-600" />
                <span className="font-bold text-[#5CA0F2] bg-[#5CA0F2]/10 px-2.5 py-1 rounded-lg border border-[#5CA0F2]/30">
                  {thirdSignChoice || 'Sign 3'}
                </span>
              </>
            )}
            <span className="text-purple-400 font-bold mx-1">➔</span>
            <span className="font-bold text-white bg-purple-900/40 px-2.5 py-1 rounded-lg border border-purple-500/40">
              "{phraseTranslation || 'Target translation preview...'}"
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSavePhraseRule}
          disabled={
            loading ||
            !firstSignChoice ||
            !secondSignChoice ||
            (phraseSignCount === 3 && !thirdSignChoice) ||
            !phraseTranslation.trim()
          }
          className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/20 flex items-center justify-center space-x-2 cursor-pointer"
        >
          <PlusActionIcon className="w-4 h-4" />
          <span>Save NLP Rule to Supabase</span>
        </button>
      </div>

      {/* Right List: Active NLP Grammar Rules Table */}
      <div className="col-span-7 bg-[#202124] border border-white/5 rounded-2xl p-6 flex flex-col gap-4 overflow-hidden min-h-0">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <ChatDrawerIcon className="w-4 h-4 text-[#5CA0F2]" />
              <span>Active Grammar Rules Directory ({phrasesList.length})</span>
            </h3>
            <p className="text-xs text-slate-400">
              Realtime auto-sync with Supabase DB table <code className="text-[#5CA0F2]">asl_phrases</code>
            </p>
          </div>
          <button
            type="button"
            onClick={loadAllData}
            disabled={loading}
            className="p-2 rounded-xl bg-[#20222A] hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Refresh rules directory"
          >
            <RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {statusMsg && (
          <div className="text-xs bg-purple-950/60 border border-purple-500/40 text-purple-200 px-3.5 py-2 rounded-xl animate-in fade-in">
            {statusMsg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-0">
          {phrasesList.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500 space-y-2">
              <ChatDrawerIcon className="w-8 h-8 text-slate-600" />
              <p className="text-xs">No compound phrase rules found in database.</p>
              <p className="text-[11px] text-slate-600 max-w-sm text-center">
                Select 2 or 3 signs on the left and enter a target translation to create the first rule!
              </p>
            </div>
          ) : (
            phrasesList.map((rule) => {
              const signs = Array.isArray(rule.signs) ? rule.signs : [];
              return (
                <div
                  key={rule.id}
                  className="bg-[#20222A] border border-slate-800 hover:border-purple-500/50 rounded-xl p-3.5 transition-all flex items-center justify-between gap-4 group"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      {signs.map((s, idx) => (
                        <React.Fragment key={idx}>
                          <span className="font-bold text-xs text-[#5CA0F2] bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/80">
                            {s}
                          </span>
                          {idx < signs.length - 1 && (
                            <ForwardNavIcon className="w-3 h-3 text-slate-500" />
                          )}
                        </React.Fragment>
                      ))}
                      <span className="text-purple-400 font-bold mx-1">➔</span>
                      <span className="font-bold text-xs text-white">
                        "{rule.translation}"
                      </span>
                    </div>
                    {rule.description && (
                      <p className="text-[11px] text-slate-400 italic">
                        {rule.description}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeletePhraseRule(rule.id)}
                    className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0 cursor-pointer"
                    title="Delete this grammar rule"
                  >
                    <DeleteActionIcon className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

