import { describe, expect, it } from 'vitest'
import { isFact } from '../fact'
import { buildViewId, isView } from '../view'
import { isAction } from '../action'
import { isWorkflow } from '../workflow'

describe('fact/view/action/workflow model', () => {
  it('recognizes a fact record', () => {
    expect(
      isFact({
        id: 'fact-1',
        kind: 'photo',
        source: 'library',
        createdAt: '2026-05-12T00:00:00.000Z',
        payload: { photoId: 'p1' },
      }),
    ).toBe(true)
  })

  it('builds a stable view id', () => {
    expect(buildViewId('similar-review', 'scan-1')).toBe('similar-review:scan-1')
  })

  it('recognizes a view record', () => {
    expect(
      isView({
        id: 'similar-review:scan-1',
        kind: 'similar-review',
        sourceFactIds: ['fact-1'],
        state: 'active',
      }),
    ).toBe(true)
  })

  it('recognizes an action record', () => {
    expect(
      isAction({
        id: 'action-1',
        kind: 'promote-candidate-group',
        targetId: 'candidate-group-1',
        reversible: true,
      }),
    ).toBe(true)
  })

  it('recognizes a workflow record', () => {
    expect(
      isWorkflow({
        id: 'workflow-1',
        kind: 'similarity-review',
        stepKinds: ['scan', 'cluster', 'review', 'promote'],
        requiresConfirmation: true,
      }),
    ).toBe(true)
  })
})
