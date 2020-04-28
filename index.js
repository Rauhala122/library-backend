const { ApolloServer, UserInputError, gql, PubSub } = require('apollo-server')
const uuid = require('uuid/v1')
const mongoose = require("mongoose")
const Book = require("./models/book")
const Author = require("./models/author")
const User = require("./models/user")
const jwt = require('jsonwebtoken')

const pubsub = new PubSub()

const JWT_SECRET = 'NEED_HERE_A_SECRET_KEY'


mongoose.set('useFindAndModify', false)

const MONGODB_URI = 'mongodb+srv://rauhala:tarkman51@cluster0-uvu50.mongodb.net/test?retryWrites=true&w=majority'

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch((error) => {
    console.log('error connection to MongoDB:', error.message)
  })

let authors = [
  {
    name: 'Robert Martin',
    id: "afa51ab0-344d-11e9-a414-719c6709cf3e",
    born: 1952,
  },
  {
    name: 'Martin Fowler',
    id: "afa5b6f0-344d-11e9-a414-719c6709cf3e",
    born: 1963
  },
  {
    name: 'Fyodor Dostoevsky',
    id: "afa5b6f1-344d-11e9-a414-719c6709cf3e",
    born: 1821
  },
  {
    name: 'Joshua Kerievsky', // birthyear not known
    id: "afa5b6f2-344d-11e9-a414-719c6709cf3e",
  },
  {
    name: 'Sandi Metz', // birthyear not known
    id: "afa5b6f3-344d-11e9-a414-719c6709cf3e",
  },
]

let books = [
  {
    title: 'Clean Code',
    published: 2008,
    author: 'Robert Martin',
    id: "afa5b6f4-344d-11e9-a414-719c6709cf3e",
    genres: ['refactoring']
  },
  {
    title: 'Agile software development',
    published: 2002,
    author: 'Robert Martin',
    id: "afa5b6f5-344d-11e9-a414-719c6709cf3e",
    genres: ['agile', 'patterns', 'design']
  },
  {
    title: 'Refactoring, edition 2',
    published: 2018,
    author: 'Martin Fowler',
    id: "afa5de00-344d-11e9-a414-719c6709cf3e",
    genres: ['refactoring']
  },
  {
    title: 'Refactoring to patterns',
    published: 2008,
    author: 'Joshua Kerievsky',
    id: "afa5de01-344d-11e9-a414-719c6709cf3e",
    genres: ['refactoring', 'patterns']
  },
  {
    title: 'Practical Object-Oriented Design, An Agile Primer Using Ruby',
    published: 2012,
    author: 'Sandi Metz',
    id: "afa5de02-344d-11e9-a414-719c6709cf3e",
    genres: ['refactoring', 'design']
  },
  {
    title: 'Crime and punishment',
    published: 1866,
    author: 'Fyodor Dostoevsky',
    id: "afa5de03-344d-11e9-a414-719c6709cf3e",
    genres: ['classic', 'crime']
  },
  {
    title: 'The Demon ',
    published: 1872,
    author: 'Fyodor Dostoevsky',
    id: "afa5de04-344d-11e9-a414-719c6709cf3e",
    genres: ['classic', 'revolution']
  },
]

const typeDefs = gql`
  type Book {
    title: String!
    published: String!
    author: Author
    genres: [String]
  }
  type Author {
    name: String!
    born: String
    bookCount: Int
  }
  type User {
    username: String!
    favoriteGenre: String!
  }
  type Token {
    value: String!
  }
  type Query {
    bookCount: Int!
    authorCount: Int!
    allBooks(author: String, genre: String): [Book!]!
    allAuthors: [Author!]!
    me: User
  }
  type Subscription {
    bookAdded: Book!
  }
  type Mutation {
    addBook(
      title: String!
      author: String!
      published: String!
      genres: [String]
    ): Book
    editAuthor(
      name: String!
      born: String!
    ): Author
    createUser(
      username: String!
      favoriteGenre: String!
    ): User
    login(
      username: String!
      password: String!
    ): Token
  }
`

const resolvers = {
  Query: {
    bookCount: () => Book.collection.countDocuments(),
    authorCount: () => Author.collection.countDocuments(),
    allBooks: async () => {
      return await Book.find({}).populate("author")
    },
    allAuthors: () => Author.find({}),
    me: (root, args, context) => {
      return context.currentUser
    }
  },
  Book: {
    author: (root) => {
      const author = Author.findOne({name: root.author.name})
      return author
    }
  },
  Author: {
    bookCount: async (root) => {
      const books = await Book.find({}).populate("author")
      const bookCount = books.filter(b => b.author.name === root.name).length
      return bookCount
    }
  },
  Mutation: {
    addBook: async (root, args, context) => {

      const author = await Author.findOne({ name: args.author })
      const book = new Book({ ...args })
      const currentUser = context.currentUser

      if (!currentUser) {
        throw new AuthenticationError("not authenticated")
      }

      if (author) {
        book.author = author
      } else {
        const newAuthor = new Author({
          name: args.author
        })
        await newAuthor.save()
        book.author = newAuthor
      }

      try {
        await book.save()
      } catch (error) {
          throw new UserInputError(error.message, {
            invalidArgs: args,
          })
      }

      pubsub.publish("BOOK_ADDED", {bookAdded: book})

      return book

    },
    editAuthor: async (root, args, context) => {
      const author = await Author.findOne({name: args.name})

      const currentUser = context.currentUser

      if (!currentUser) {
        throw new AuthenticationError("not authenticated")
      }

      author.born = args.born
      if (!args) {
        return null
      }
      return author.save()
    },
    createUser: (root, args) => {
      const user = new User({ username: args.username, favoriteGenre: args.favoriteGenre })

      return user.save()
        .catch(error => {
          throw new UserInputError(error.message, {
            invalidArgs: args
          })
        })
    },
    login: async (root, args) => {
      const user = await User.findOne({ username: args.username })

      if (!user || args.password !== "secret") {
        throw new UserInputError("Wrong credentials")
      }

      const userForToken = {
        username: user.username,
        id: user._id
      }

      return {  value: jwt.sign(userForToken, JWT_SECRET) }
    }
  },
  Subscription: {
    bookAdded: {
      subscribe: () => pubsub.asyncIterator(["BOOK_ADDED"])
    }
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ req }) => {
    const auth = req ? req.headers.authorization : null
    if (auth && auth.toLowerCase().startsWith('bearer ')) {
      const decodedToken = jwt.verify(
        auth.substring(7), JWT_SECRET
      )
      const currentUser = await User
        .findById(decodedToken.id)
      return { currentUser }
    }
  }

})

server.listen().then(({ url, subscriptionsUrl }) => {
  console.log(`Server ready at ${url}`)
  console.log(`Subscriptions ready at ${subscriptionsUrl}`)
})
