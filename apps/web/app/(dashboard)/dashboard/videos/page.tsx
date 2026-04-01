'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import type { Video } from '@influencerapp/shared-types';
import { Upload, Video as VideoIcon, Trash2 } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  uploading: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  ready: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export default function VideosPage() {
  const { accessToken } = useAuthStore();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ title: '', description: '' });

  useEffect(() => {
    if (!accessToken) return;
    api.get<{ videos: Video[] }>('/v1/videos', accessToken)
      .then((r) => setVideos(r.videos))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !accessToken) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      // 1. Create video record + get presigned URL
      const { video, uploadUrl } = await api.post<{ video: Video; uploadUrl: string }>(
        '/v1/videos',
        { title: form.title, description: form.description, contentType: file.type },
        accessToken
      );

      // 2. Upload directly to S3 using XHR (for progress tracking)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => (xhr.status < 400 ? resolve() : reject(new Error('Upload failed')));
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      setVideos((v) => [video, ...v]);
      setForm({ title: '', description: '' });
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: any) {
      alert(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function deleteVideo(id: string) {
    if (!accessToken || !confirm('Delete this video?')) return;
    await api.delete(`/v1/videos/${id}`, accessToken).catch(() => {});
    setVideos((v) => v.filter((video) => video.id !== id));
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Videos</h1>
        <p className="text-muted-foreground">Upload workout videos for your subscribers</p>
      </div>

      {/* Upload form */}
      <div className="bg-card border rounded-lg p-6">
        <h2 className="font-semibold mb-4">Upload New Video</h2>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1.5">Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Week 1 - Upper Body"
                className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Description (optional)</label>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md bg-background text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Video File</label>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              required
              className="w-full text-sm"
            />
          </div>

          {uploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Upload Video'}
          </button>
        </form>
      </div>

      {/* Video list */}
      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : videos.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <VideoIcon className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No videos uploaded yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {videos.map((video) => (
            <div key={video.id} className="bg-card border rounded-lg p-4 flex items-center gap-4">
              <div className="w-16 h-12 bg-muted rounded flex items-center justify-center shrink-0">
                {video.thumbnailUrl ? (
                  <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover rounded" />
                ) : (
                  <VideoIcon className="w-6 h-6 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{video.title}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[video.status]}`}>
                    {video.status}
                  </span>
                  {video.durationSeconds && (
                    <span className="text-xs text-muted-foreground">
                      {Math.floor(video.durationSeconds / 60)}:{String(video.durationSeconds % 60).padStart(2, '0')}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => deleteVideo(video.id)}
                className="p-1.5 rounded hover:bg-destructive/10 text-destructive shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
