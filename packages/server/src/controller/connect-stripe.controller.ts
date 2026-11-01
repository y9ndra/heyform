import { Controller, Get, Query, Res } from '@nestjs/common'
import type { Response } from 'express'

@Controller()
export class ConnectStripeController {
  @Get('/connect/stripe/callback')
  async index(@Query() query: Record<string, string>, @Res() res: Response) {
    return res.render('connect-stripe', {
      payload: query
    })
  }
}
