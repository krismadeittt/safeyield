import { useState, useCallback } from 'react';
import { uploadCSV, getCSVUploads } from '../../api/extreme';
import { parseCSV } from '../../utils/csvParser';

export default function useCSVUpload(getToken) {
  const [uploads, setUploads] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null); // { format, headers, rows, errors }
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState(null);

  const loadUploads = useCallback(async () => {
    try {
      var data = await getCSVUploads(getToken);
      setUploads(data || []);
    } catch (e) {
      console.warn('Failed to load CSV uploads:', e.message);
    }
  }, [getToken]);

  const parseFile = useCallback((file) => {
    setParsing(true);
    setError(null);
    setPreview(null);
    setUploadResult(null);

    if (file.size > 10 * 1024 * 1024) {
      setError('File exceeds 10MB limit');
      setParsing(false);
      return;
    }

    var reader = new FileReader();
    reader.onload = (e) => {
      var text = e.target.result;
      var result = parseCSV(text);
      setPreview({ ...result, filename: file.name, rawText: text });
      setParsing(false);
    };
    reader.onerror = () => {
      setError('Failed to read file');
      setParsing(false);
    };
    reader.readAsText(file);
  }, []);

  const upload = useCallback(async () => {
    if (!preview || !preview.rawText) return;
    setUploading(true);
    setError(null);
    try {
      var result = await uploadCSV(getToken, preview.rawText, preview.filename);
      setUploadResult(result);
      setPreview(null);
      await loadUploads();
      return result;
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }, [getToken, preview, loadUploads]);

  const clearPreview = useCallback(() => {
    setPreview(null);
    setUploadResult(null);
    setError(null);
  }, []);

  return {
    uploads, preview, uploadResult, parsing, uploading, error,
    loadUploads, parseFile, upload, clearPreview,
  };
}
