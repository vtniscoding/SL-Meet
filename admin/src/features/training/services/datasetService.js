import { supabase } from '@sl-meet/shared';

/**
 * Dataset Service for Gesture and Phrase Database Operations
 */

export async function fetchGestures() {
  const { data, error } = await supabase
    .from('asl_dataset')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchPhrases() {
  const { data, error } = await supabase
    .from('asl_phrases')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function insertGestureSample(payload) {
  const { data, error } = await supabase
    .from('asl_dataset')
    .insert([payload])
    .select();

  if (error) throw error;
  return data;
}

export async function deleteGestureSample(id) {
  const { error } = await supabase
    .from('asl_dataset')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function deleteGestureLabelGroup(label) {
  const { error } = await supabase
    .from('asl_dataset')
    .delete()
    .eq('name', label);

  if (error) throw error;
}

export async function renameGestureLabel(oldLabel, newLabel) {
  const { error } = await supabase
    .from('asl_dataset')
    .update({ name: newLabel })
    .eq('name', oldLabel);

  if (error) throw error;
}

export async function insertPhraseRule(rule) {
  const { data, error } = await supabase
    .from('asl_phrases')
    .insert([rule])
    .select();

  if (error) throw error;
  return data;
}

export async function deletePhraseRule(id) {
  const { error } = await supabase
    .from('asl_phrases')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export function exportDatasetToJson(gesturesList) {
  const jsonContent = JSON.stringify(gesturesList, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sl_meet_asl_dataset_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function parseImportedJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!Array.isArray(parsed)) {
          return reject(new Error('Invalid dataset format: expected JSON array'));
        }
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse JSON file: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

