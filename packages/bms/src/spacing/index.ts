import { Speedcore } from '../speedcore'
import { BMSChart } from '../bms/chart'
import { SpeedSegment } from '../speedcore/segment'

/**
 * A Spacing represents the relation between song beats and notes spacing factor (a.k.a HI-SPEED).
 * Some rhythm game (such as Pump It Up!) lets chart author change the note spacing factor dynamically.
 * In StepMania 5, this is called the speed segments.
 *
 * @public
 */
export class Spacing {
  private _speedcore?: Speedcore

  /**
   * Constructs a {@link Spacing} from the given {@link SpacingSegment}.
   */
  constructor(segments: SpacingSegment[]) {
    if (segments.length > 0) {
      this._speedcore = new Speedcore(segments)
    }
  }

  /**
   * Returns the note spacing factor at the specified beat.
   * @param beat - The beat
   */
  factor(beat: number) {
    if (this._speedcore) {
      return this._speedcore.x(beat)
    } else {
      return 1
    }
  }

  /**
   * Creates a {@link Spacing} object from the {@link BMSChart}.
   *
   * @remarks
   *
   * In BMS format note spacing is defined using `#SPEED` and `#xxxSP` channels.
   *
   * Speed is defined as keyframes. These keyframes will be linearly interpolated.
   *
   * ```
   * #SPEED01 1.0
   * #SPEED02 2.0
   *
   * #001SP:01010202
   * ```
   *
   * In this example, the note spacing factor will gradually change
   * from 1.0x at beat 1 to 2.0x at beat 2.
   *
   * @param chart - The BMSChart to create the Spacing from
   */
  static fromBMSChart(chart: BMSChart) {
    void BMSChart
    var segments: SpacingSegment[] = []
    chart.objects.allSorted().forEach(function (object) {
      if (object.channel === 'SP') {
        var beat = chart.measureToBeat(object.measure, object.fraction)
        var factor = +chart.headers.get('speed' + object.value)!
        if (isNaN(factor)) return
        if (segments.length > 0) {
          var previous = segments[segments.length - 1]
          previous.dx = (factor - previous.x) / (beat - previous.t)
        }
        segments.push({
          t: beat,
          x: factor,
          dx: 0,
          inclusive: true,
        })
      }
    })
    if (segments.length > 0) {
      segments.unshift({
        t: 0,
        x: segments[0].x,
        dx: 0,
        inclusive: true,
      })
    }
    return new Spacing(segments)
  }
}

/**
 * @public
 */
export interface SpacingSegment extends SpeedSegment {
  /** The beat number */
  t: number
  /** The spacing at beat `t` */
  x: number
  /**
   * The amount spacing factor change per beat,
   * in order to create a continuous speed change
   */
  dx: number
  /**
   * Whether or not to include the
   * starting beat `t` as part of the segment
   */
  inclusive: boolean
}
