import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  supabase,
  getSampleDescriptor,
  loadCustomDataset,
  initRealtimeDatasetSync,
  fetchPhrasesFromSupabase,
  initRealtimePhrasesSync,
  addPhraseRule,
  deletePhraseRule,
  isDynamicSample,
} from '@sl-meet/shared';

export function useGestureDataset(isAuthenticated) {
  const [gesturesList, setGesturesList] = useState([]);
  const [phrasesList, setPhrasesList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Roster Search & Filter State
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterFilter, setRosterFilter] = useState('all'); // 'all' | 'static' | 'dynamic' | '1h' | '2h'

  // Load Gestures & Phrases from Supabase DB
  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: gesturesData } = await supabase
        .from('asl_gestures')
        .select('*')
        .order('created_at', { ascending: false });

      if (Array.isArray(gesturesData)) {
        setGesturesList(gesturesData);
        loadCustomDataset(gesturesData);
      }

      const phrasesData = await fetchPhrasesFromSupabase();
      if (Array.isArray(phrasesData)) {
        setPhrasesList(phrasesData);
      }
    } catch (err) {
      console.error('Failed to load data from Supabase:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Realtime Subscriptions for both tables
  useEffect(() => {
    if (!isAuthenticated) return;

    const gChannel = initRealtimeDatasetSync((updatedGestures) => {
      setGesturesList(updatedGestures);
    });

    const pChannel = initRealtimePhrasesSync((updatedPhrases) => {
      setPhrasesList(updatedPhrases);
    });

    return () => {
      if (gChannel?.unsubscribe) gChannel.unsubscribe();
      if (pChannel?.unsubscribe) pChannel.unsubscribe();
    };
  }, [isAuthenticated]);

  // Group gestures by Label Name
  const groupedGestures = useMemo(() => {
    const map = {};
    gesturesList.forEach((g) => {
      const label = (g.name || 'Unlabeled').trim();
      if (!map[label]) map[label] = [];
      map[label].push(g);
    });
    return map;
  }, [gesturesList]);

  const existingLabels = useMemo(() => Object.keys(groupedGestures), [groupedGestures]);

  // Dataset modality counts
  const datasetStats = useMemo(() => {
    let staticCount = 0;
    let dynamicCount = 0;
    let oneHandCount = 0;
    let twoHandCount = 0;

    for (const s of gesturesList) {
      const desc = getSampleDescriptor(s);
      if (desc.isDynamic) dynamicCount += 1;
      else staticCount += 1;

      if (desc.isTwoHand) twoHandCount += 1;
      else oneHandCount += 1;
    }

    return { staticCount, dynamicCount, oneHandCount, twoHandCount };
  }, [gesturesList]);

  // Filtered Roster Labels & Samples
  const filteredRosterEntries = useMemo(() => {
    const query = rosterSearch.trim().toLowerCase();
    const entries = [];

    for (const label of existingLabels) {
      if (query && !label.toLowerCase().includes(query)) continue;

      const allSamples = groupedGestures[label] || [];
      const matchingSamples = allSamples.filter((s) => {
        if (rosterFilter === 'all') return true;
        const desc = getSampleDescriptor(s);
        if (rosterFilter === 'static') return !desc.isDynamic;
        if (rosterFilter === 'dynamic') return desc.isDynamic;
        if (rosterFilter === '1h') return !desc.isTwoHand;
        if (rosterFilter === '2h') return desc.isTwoHand;
        return true;
      });

      if (matchingSamples.length > 0) {
        entries.push({ label, samples: matchingSamples, totalCount: allSamples.length });
      }
    }

    return entries;
  }, [existingLabels, groupedGestures, rosterSearch, rosterFilter]);

  // Save Gesture Sample (Static 1D or Dynamic 2D DTW) to Supabase DB `asl_gestures`
  const handleSaveSample = async (gestureName, capturedPayload, onSaved) => {
    if (!gestureName?.trim()) {
      setStatusMsg('Please enter or select a Gesture Label Name before saving!');
      return false;
    }
    if (!capturedPayload?.vector) {
      setStatusMsg('Please record a gesture sample first!');
      return false;
    }

    const isDynamic = capturedPayload.mode === 'dynamic';
    const isTwoHands = capturedPayload.handCount === 2;
    const labelTrimmed = gestureName.trim();
    const existingCount = (groupedGestures[labelTrimmed] || []).length;

    const rowType = isDynamic
      ? isTwoHands
        ? 'dynamic_two_hands'
        : 'dynamic_single_hand'
      : isTwoHands
      ? 'two_hands'
      : 'single_hand';

    const rowCategory = isDynamic
      ? 'dynamic_motion_sign'
      : isTwoHands
      ? 'two_hand_sign'
      : 'single_hand_sign';

    const descText = isDynamic
      ? `Dynamic DTW #${existingCount + 1} (${isTwoHands ? '2H' : '1H'} • ${capturedPayload.sequenceLength}×${capturedPayload.dimension}D • Q:${capturedPayload.qualityScore}%)`
      : `Variation #${existingCount + 1} (${isTwoHands ? '2 hands' : '1 hand'} • Q:${capturedPayload.qualityScore}%)`;

    setLoading(true);
    try {
      const { error } = await supabase.from('asl_gestures').insert({
        name: labelTrimmed,
        type: rowType,
        category: rowCategory,
        vector: capturedPayload.vector,
        description: descText,
        metadata: {
          is_dynamic: isDynamic,
          sequence_length: isDynamic ? capturedPayload.sequenceLength : 1,
          dimension: capturedPayload.dimension,
          feature_version: capturedPayload.featureVersion || 1,
          face_coverage_pct: isDynamic ? (capturedPayload.faceCoveragePct ?? null) : null,
          dominant_zone: isDynamic ? (capturedPayload.dominantZone ?? null) : null,
          mean_index_uv: isDynamic ? (capturedPayload.meanIndexUV ?? null) : null,
          unified_two_hands: isTwoHands,
          quality_score: capturedPayload.qualityScore,
          motion_amplitude: capturedPayload.motionAmplitude ?? null,
          recorded_at: new Date().toISOString(),
        },
      });

      if (!error) {
        setStatusMsg(
          `Saved ${isDynamic ? 'Dynamic DTW' : 'Static Pose'} sample #${existingCount + 1} for "${labelTrimmed}" & synced live!`
        );
        onSaved?.();
        await loadAllData();
        return true;
      } else {
        setStatusMsg(`Failed to save to Supabase: ${error.message}`);
        return false;
      }
    } catch (err) {
      setStatusMsg('Database connection error.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Delete single sample from Supabase DB
  const handleDeleteSample = async (id, labelName) => {
    if (!window.confirm(`Delete this sample variation for "${labelName}"?`)) return;

    try {
      const { error } = await supabase.from('asl_gestures').delete().eq('id', id);
      if (!error) {
        setStatusMsg(`Deleted sample variation for "${labelName}".`);
        loadAllData();
      } else {
        setStatusMsg(`Failed to delete: ${error.message}`);
      }
    } catch (err) {
      setStatusMsg('Database deletion error.');
    }
  };

  // Delete all samples for a label
  const handleDeleteLabelGroup = async (labelName, onDeleted) => {
    if (!window.confirm(`Delete ALL sample variations for gesture "${labelName}"?`)) return;

    try {
      const { error } = await supabase.from('asl_gestures').delete().eq('name', labelName);
      if (!error) {
        setStatusMsg(`Deleted gesture label "${labelName}" and all its samples.`);
        onDeleted?.();
        loadAllData();
      } else {
        setStatusMsg(`Failed to delete label: ${error.message}`);
      }
    } catch (err) {
      setStatusMsg('Database deletion error.');
    }
  };

  // Rename label in Supabase DB
  const handleRenameLabel = async (oldLabel, onRenamed) => {
    const newName = prompt(`Enter new label name for "${oldLabel}":`, oldLabel);
    if (!newName || !newName.trim() || newName.trim() === oldLabel) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('asl_gestures')
        .update({ name: newName.trim() })
        .eq('name', oldLabel);

      if (!error) {
        setStatusMsg(`Renamed gesture "${oldLabel}" to "${newName.trim()}" in Supabase!`);
        onRenamed?.(newName.trim());
        loadAllData();
      } else {
        setStatusMsg(`Failed to rename: ${error.message}`);
      }
    } catch (err) {
      setStatusMsg('Database update error.');
    } finally {
      setLoading(false);
    }
  };

  // Save Phrase Rule (2 or 3 signs) to Supabase DB `asl_phrases`
  const handleSavePhraseRule = async ({
    phraseSignCount,
    firstSignChoice,
    secondSignChoice,
    thirdSignChoice,
    phraseTranslation,
    phraseDesc,
    onSuccess,
  }) => {
    const signs =
      phraseSignCount === 3
        ? [firstSignChoice.trim(), secondSignChoice.trim(), thirdSignChoice.trim()]
        : [firstSignChoice.trim(), secondSignChoice.trim()];

    if (signs.some((s) => !s) || !phraseTranslation.trim()) {
      setStatusMsg(
        phraseSignCount === 3
          ? 'Please select Sign 1, Sign 2, Sign 3 and provide a target translation!'
          : 'Please select Sign 1, Sign 2 and provide a target translation!'
      );
      return;
    }

    setLoading(true);
    try {
      const res = await addPhraseRule(signs, phraseTranslation.trim(), phraseDesc.trim());

      if (res.success) {
        setStatusMsg(
          `Saved phrase rule "${phraseTranslation.trim()}" and synced live!`
        );
        onSuccess?.();
        const updated = await fetchPhrasesFromSupabase();
        setPhrasesList(updated);
      } else {
        setStatusMsg(`Failed to save phrase rule: ${res.message || res.error}`);
      }
    } catch (err) {
      setStatusMsg('Database connection error while saving phrase rule.');
    } finally {
      setLoading(false);
    }
  };

  // Delete Phrase Rule from Supabase DB
  const handleDeletePhraseRule = async (id, translation) => {
    if (!window.confirm(`Delete compound phrase rule "${translation}"?`)) return;

    try {
      const res = await deletePhraseRule(id);
      if (res.success) {
        setStatusMsg('Deleted phrase rule.');
        const updated = await fetchPhrasesFromSupabase();
        setPhrasesList(updated);
      } else {
        setStatusMsg('Failed to delete phrase rule.');
      }
    } catch (err) {
      setStatusMsg('Error deleting phrase rule.');
    }
  };

  // Export Dataset & Phrases JSON Backup
  const handleExportJson = () => {
    const jsonStr = JSON.stringify(
      {
        name: 'SL-Meet Exported Dataset (Static k-NN + Dynamic DTW)',
        version: '3.0',
        exportedAt: new Date().toISOString(),
        gestures: gesturesList,
        compoundPhrases: phrasesList,
      },
      null,
      2
    );
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sl-meet-dataset-db-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import Dataset & Phrases JSON Backup into Supabase (Non-Destructive Merge)
  const handleImportJson = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);

      const rawGestures = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.gestures)
        ? parsed.gestures
        : [];
      const rawPhrases = Array.isArray(parsed?.compoundPhrases)
        ? parsed.compoundPhrases
        : [];

      const validGestures = rawGestures.filter(
        (g) => g && typeof g.name === 'string' && g.name.trim() && Array.isArray(g.vector)
      );
      const validPhrases = rawPhrases.filter(
        (p) =>
          p &&
          Array.isArray(p.pattern) &&
          p.pattern.length >= 2 &&
          typeof p.translation === 'string' &&
          p.translation.trim()
      );

      if (validGestures.length === 0 && validPhrases.length === 0) {
        setStatusMsg('Invalid backup JSON: No valid gestures or phrase rules found.');
        return;
      }

      // Deduplicate against existing DB IDs & identical phrase patterns
      const existingIds = new Set(gesturesList.map((g) => g.id).filter(Boolean));
      const gesturesToInsert = validGestures
        .filter((g) => !g.id || !existingIds.has(g.id))
        .map((g) => ({
          name: g.name.trim(),
          type: g.type || (isDynamicSample(g) ? 'dynamic_single_hand' : 'single_hand'),
          category: g.category || (isDynamicSample(g) ? 'dynamic_motion_sign' : 'single_hand_sign'),
          vector: g.vector,
          description: g.description || `Imported from ${file.name}`,
          metadata: g.metadata || { imported_at: new Date().toISOString() },
        }));

      const existingPatternKeys = new Set(
        phrasesList.map((p) => (Array.isArray(p.pattern) ? p.pattern.join('||').toLowerCase() : ''))
      );
      const phrasesToInsert = validPhrases
        .filter((p) => !existingPatternKeys.has(p.pattern.join('||').toLowerCase()))
        .map((p) => ({
          pattern: p.pattern,
          translation: p.translation.trim(),
          description: p.description || '',
        }));

      if (gesturesToInsert.length === 0 && phrasesToInsert.length === 0) {
        setStatusMsg('All samples and phrases in this backup file already exist in Supabase!');
        return;
      }

      const confirmed = window.confirm(
        `Import ${gesturesToInsert.length} new gesture sample(s) and ${phrasesToInsert.length} new phrase rule(s) into Supabase?`
      );
      if (!confirmed) return;

      setLoading(true);
      let insertedG = 0;
      let insertedP = 0;

      // Insert gestures in batches of 50
      for (let i = 0; i < gesturesToInsert.length; i += 50) {
        const chunk = gesturesToInsert.slice(i, i + 50);
        const { error } = await supabase.from('asl_gestures').insert(chunk);
        if (error) throw error;
        insertedG += chunk.length;
      }

      if (phrasesToInsert.length > 0) {
        const { error } = await supabase.from('asl_phrases').insert(phrasesToInsert);
        if (error) throw error;
        insertedP = phrasesToInsert.length;
      }

      await loadAllData();
      setStatusMsg(
        `Successfully imported ${insertedG} gesture sample(s) and ${insertedP} phrase rule(s)!`
      );
    } catch (err) {
      console.error('Failed to import backup JSON:', err);
      setStatusMsg(`Import failed: ${err.message || 'Invalid JSON format'}`);
    } finally {
      setLoading(false);
    }
  };

  return {
    gesturesList,
    phrasesList,
    loading,
    statusMsg,
    setStatusMsg,
    rosterSearch,
    setRosterSearch,
    rosterFilter,
    setRosterFilter,
    groupedGestures,
    existingLabels,
    datasetStats,
    filteredRosterEntries,
    loadAllData,
    handleSaveSample,
    handleDeleteSample,
    handleDeleteLabelGroup,
    handleRenameLabel,
    handleSavePhraseRule,
    handleDeletePhraseRule,
    handleExportJson,
    handleImportJson,
  };
}

