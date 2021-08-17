import DataStructure from 'data-structure'

export const Segment = DataStructure<SpeedSegment>({
  t: 'number',
  x: 'number',
  dx: 'number',
})

export interface SpeedSegment {
  t: number
  x: number
  /** the amount of change in x per t */
  dx: number
  /** whether or not the segment includes the t */
  inclusive: boolean
}
