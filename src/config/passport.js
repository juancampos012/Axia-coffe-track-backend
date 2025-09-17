const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('./logger');
require('dotenv').config();


const cookieExtractor = (req) => {
  let token = null;
  if (req && req.cookies) {
    token = req.cookies['authToken']; 
  }
  return token;
};

const options = {
  jwtFromRequest: cookieExtractor,
  secretOrKey: process.env.JWT_SECRET,
};

passport.use(
  new JwtStrategy(options, async (jwt_payload, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: jwt_payload.id },
      });
      
      if (user) {
        logger.info(`User ${user.id} authenticated successfully`);
        return done(null, user);
      }
      logger.warn(`User with id ${jwt_payload.id} not found`);
      return done(null, false);
    } catch (error) {
      logger.error(`Error authenticating user: ${error.message}`);
      return done(error, false);
    }
  })
);

module.exports = passport;