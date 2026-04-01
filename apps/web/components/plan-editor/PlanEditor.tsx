'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import { useState, useCallback } from 'react';
import type { PlanContent, PlanSection, PlanCategory } from '@influencerapp/shared-types';
import { v4 as uuidv4 } from 'uuid';
import { Bold, Italic, List, ListOrdered, Heading2, Heading3, Plus, Trash2 } from 'lucide-react';

interface PlanEditorProps {
  initialTitle?: string;
  initialDescription?: string;
  initialCategory?: PlanCategory;
  initialContent?: PlanContent;
  onSave: (data: {
    title: string;
    description: string;
    category: PlanCategory;
    content: PlanContent;
  }) => Promise<void>;
  saving?: boolean;
}

const CATEGORIES: { value: PlanCategory; label: string }[] = [
  { value: 'workout', label: 'Workout' },
  { value: 'diet', label: 'Diet' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'habit', label: 'Habit' },
  { value: 'mindset', label: 'Mindset' },
  { value: 'other', label: 'Other' },
];

function SectionEditor({
  section,
  onChange,
  onRemove,
}: {
  section: PlanSection;
  onChange: (s: PlanSection) => void;
  onRemove: () => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Heading.configure({ levels: [2, 3] }),
    ],
    content: section.body,
    onUpdate: ({ editor }) => {
      onChange({ ...section, body: editor.getText() });
    },
  });

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <input
          value={section.heading}
          onChange={(e) => onChange({ ...section, heading: e.target.value })}
          placeholder="Section heading..."
          className="flex-1 bg-transparent text-sm font-medium outline-none"
        />
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Toolbar */}
      {editor && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-background">
          {[
            { icon: Bold, action: () => editor.chain().focus().toggleBold().run(), label: 'Bold' },
            { icon: Italic, action: () => editor.chain().focus().toggleItalic().run(), label: 'Italic' },
            { icon: Heading2, action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), label: 'H2' },
            { icon: Heading3, action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), label: 'H3' },
            { icon: List, action: () => editor.chain().focus().toggleBulletList().run(), label: 'List' },
            { icon: ListOrdered, action: () => editor.chain().focus().toggleOrderedList().run(), label: 'Ordered' },
          ].map(({ icon: Icon, action, label }) => (
            <button
              key={label}
              type="button"
              onClick={action}
              title={label}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      )}

      <EditorContent editor={editor} className="prose prose-sm max-w-none p-3 min-h-[120px] focus-within:outline-none" />
    </div>
  );
}

export default function PlanEditor({
  initialTitle = '',
  initialDescription = '',
  initialCategory = 'workout',
  initialContent = { sections: [] },
  onSave,
  saving = false,
}: PlanEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [category, setCategory] = useState<PlanCategory>(initialCategory);
  const [sections, setSections] = useState<PlanSection[]>(
    initialContent.sections.length > 0
      ? initialContent.sections
      : [{ id: uuidv4(), heading: '', body: '' }]
  );

  const addSection = useCallback(() => {
    setSections((s) => [...s, { id: uuidv4(), heading: '', body: '' }]);
  }, []);

  const updateSection = useCallback((index: number, updated: PlanSection) => {
    setSections((s) => s.map((sec, i) => (i === index ? updated : sec)));
  }, []);

  const removeSection = useCallback((index: number) => {
    setSections((s) => s.filter((_, i) => i !== index));
  }, []);

  async function handleSave() {
    await onSave({ title, description, category, content: { sections } });
  }

  return (
    <div className="space-y-6">
      {/* Metadata */}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium block mb-1.5">Plan Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 12-Week Strength Program"
            className="w-full px-3 py-2 border rounded-md bg-background text-lg font-medium"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PlanCategory)}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Short Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief overview..."
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Content Sections</h2>
          <button
            type="button"
            onClick={addSection}
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Plus className="w-4 h-4" /> Add Section
          </button>
        </div>

        {sections.map((section, i) => (
          <SectionEditor
            key={section.id}
            section={section}
            onChange={(updated) => updateSection(i, updated)}
            onRemove={() => removeSection(i)}
          />
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Plan'}
        </button>
      </div>
    </div>
  );
}
