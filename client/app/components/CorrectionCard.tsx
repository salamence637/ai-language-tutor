'use client';

import { Correction } from '../types';

interface CorrectionCardProps {
  correction: Correction;
}

export default function CorrectionCard({ correction }: CorrectionCardProps) {
  const typeColors: Record<string, string> = {
    grammar: 'bg-purple-100 border-purple-300 text-purple-800',
    wording: 'bg-blue-100 border-blue-300 text-blue-800',
    fluency: 'bg-green-100 border-green-300 text-green-800',
  };

  return (
    <div className={`p-4 rounded-lg border-2 ${typeColors[correction.type] || typeColors.grammar}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase px-2 py-1 rounded bg-white bg-opacity-50">
              {correction.type}
            </span>
          </div>

          <div className="space-y-2">
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1">Original:</div>
              <div className="text-sm font-medium">{correction.original}</div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1">Suggestion:</div>
              <div className="text-sm font-medium text-green-700">{correction.suggestion}</div>
            </div>

            {correction.explanation && (
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">Explanation:</div>
                <div className="text-sm">{correction.explanation}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
